# server/main.py
import os, uuid, json, time, shutil, requests, logging
from pathlib import Path
from typing import Optional, Iterable, Dict, Any, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from hashlib import sha256
from gradio_client import Client

logger = logging.getLogger("uvicorn.error")

# -------------------
# Config
# -------------------
SPACE_URL = "https://hysts-shap-e.hf.space"  # Shap-E Space
client = Client(SPACE_URL)                   # one client for both endpoints

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MODELS_DIR = STATIC_DIR / "models"
SESSIONS_DIR = BASE_DIR / "sessions"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

PLACEHOLDER = MODELS_DIR / "placeholder.glb"  # optional: put a small .glb here for quota fallback

# -------------------
# FastAPI & CORS
# -------------------
app = FastAPI(title="Shap-E bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# -------------------
# Caching
# -------------------
CACHE_INDEX = BASE_DIR / "cache_index.json"
CACHE: Dict[str, str] = json.loads(CACHE_INDEX.read_text(encoding="utf-8")) if CACHE_INDEX.exists() else {}

def cache_put(key: str, rel_url: str):
    CACHE[key] = rel_url
    CACHE_INDEX.write_text(json.dumps(CACHE, indent=2), encoding="utf-8")

def cache_get(key: str) -> Optional[str]:
    return CACHE.get(key)

def cache_key(prompt: str, seed: int, guidance_scale: float, num_inference_steps: int) -> str:
    raw = json.dumps(
        {"prompt": prompt, "seed": seed, "guidance_scale": guidance_scale, "num_inference_steps": num_inference_steps},
        sort_keys=True,
    )
    return sha256(raw.encode("utf-8")).hexdigest()

# -------------------
# Schemas
# -------------------
class GenReq(BaseModel):
    prompt: str
    seed: int = 0
    guidance_scale: float = 15
    num_inference_steps: int = 64

class GenResp(BaseModel):
    id: str
    url: str

class BatchReq(BaseModel):
    prompt: str
    seeds: List[int] = [0, 1, 2]
    guidance_scale: float = 15
    num_inference_steps: int = 64

class BatchItem(BaseModel):
    seed: int
    url: str

class BatchResp(BaseModel):
    items: List[BatchItem]

class SessionCreate(BaseModel):
    title: Optional[str] = None
    seed: int = 0
    guidance_scale: float = 15
    num_inference_steps: int = 64

class SessionResp(BaseModel):
    id: str
    title: str
    created_at: float
    items: list

class AppendReq(BaseModel):
    session_id: str
    edit: str
    seed: Optional[int] = None
    guidance_scale: Optional[float] = None
    num_inference_steps: Optional[int] = None


# -------------------
# Helpers: response materialization
# -------------------
def _iter_strings(obj) -> Iterable[str]:
    if obj is None:
        return
    if isinstance(obj, str):
        yield obj; return
    if isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _iter_strings(v)
        return
    if isinstance(obj, dict):
        if "data" in obj:
            yield from _iter_strings(obj["data"])
        for v in obj.values():
            yield from _iter_strings(v)

def _pick_candidate(strings) -> Optional[str]:
    strings = list(strings) if strings else []
    priority = (".glb", ".gltf", ".zip", ".ply", ".obj")
    # strict suffix first
    for ext in priority:
        for s in strings:
            if s.lower().strip().endswith(ext):
                return s
    # then contains
    for ext in priority:
        for s in strings:
            if ext in s.lower():
                return s
    return strings[0] if strings else None

def _materialize_to_models(result) -> Path:
    """
    Normalize whatever the Space returns into a local file in /static/models,
    supporting:
      - full HTTP(s) URL
      - Shap-E '/file=...' URLs (we prefix SPACE_URL)
      - local path on our machine
      - gradio asset tokens (download via client.download)
    """
    cand = _pick_candidate(_iter_strings(result))
    if not cand:
        raise HTTPException(502, f"No file-like string in response: {str(result)[:200]}")

    # Decide extension
    ext = ".glb"
    for e in (".glb", ".gltf", ".zip", ".ply", ".obj"):
        if e in cand.lower():
            ext = e
            break
    out_path = MODELS_DIR / f"{uuid.uuid4().hex}{ext}"

    # HTTP(s)
    if cand.startswith(("http://", "https://")):
        with requests.get(cand, stream=True, timeout=600) as r:
            if r.status_code != 200:
                raise HTTPException(502, f"File download failed: {r.status_code}")
            with open(out_path, "wb") as f:
                for chunk in r.iter_content(1024 * 1024):
                    f.write(chunk)
        return out_path

    # Shap-E local asset
    if cand.startswith("/file"):
        url = f"{SPACE_URL}{cand}"
        with requests.get(url, stream=True, timeout=600) as r:
            if r.status_code != 200:
                raise HTTPException(502, f"File download failed: {r.status_code}")
            with open(out_path, "wb") as f:
                for chunk in r.iter_content(1024 * 1024):
                    f.write(chunk)
        return out_path

    # Local path
    if os.path.exists(cand):
        shutil.copyfile(cand, out_path)
        return out_path

    # Gradio token -> download
    try:
        local_path = client.download(cand)
        shutil.copyfile(local_path, out_path)
        return out_path
    except Exception as e:
        raise HTTPException(502, f"Could not materialize asset: {e}")

# -------------------
# Helpers: sessions & prompts
# -------------------
def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"

def _load_session(session_id: str) -> Dict[str, Any]:
    p = _session_path(session_id)
    if not p.exists():
        raise HTTPException(404, "Session not found")
    return json.loads(p.read_text(encoding="utf-8"))

def _save_session(data: Dict[str, Any]) -> None:
    _session_path(data["id"]).write_text(json.dumps(data, indent=2), encoding="utf-8")

def _build_composite_prompt(history_items: list, user_edit: str) -> str:
    recent = [it.get("prompt", "") for it in history_items[-3:]]
    context = ""
    if recent:
        context = "Previous design context:\n- " + "\n- ".join(recent) + "\n\n"
    template = f"""Task: Generate a 3D mesh.

{context}Update instructions:
- {user_edit}

Constraints:
- Camera-neutral (not an image render).
- Coherent topology.
- Keep proportions from context unless directly changed above.
- If colors are specified, apply them to materials.

Output: A single .glb file.
"""
    return template


# -------------------
# Model callers (Gradio client)
# -------------------
def safe_call_text(prompt: str, seed: int, guidance_scale: float, num_inference_steps: int):
    try:
        return client.predict(
            prompt=prompt,
            seed=seed,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            api_name="/text-to-3d",
        )
    except Exception as e:
        msg = str(e)
        if ("GPU quota" in msg or "exceeded" in msg) and PLACEHOLDER.exists():
            return str(PLACEHOLDER)
        raise


# -------------------
# Routes
# -------------------
@app.get("/health")
def health():
    return {"ok": True, "space": SPACE_URL, "cache_keys": len(CACHE)}

# ----- Text one-off -----
@app.post("/gen3d", response_model=GenResp)
def gen3d(req: GenReq):
    key = cache_key(req.prompt, req.seed, req.guidance_scale, req.num_inference_steps)
    hit = cache_get(key)
    if hit:
        return GenResp(id=Path(hit).stem, url=hit)

    result = safe_call_text(req.prompt, req.seed, req.guidance_scale, req.num_inference_steps)
    out_path = _materialize_to_models(result)
    rel = f"/{out_path.relative_to(BASE_DIR).as_posix()}"
    cache_put(key, rel)
    return GenResp(id=out_path.stem, url=rel)

# ----- Batch (multi-seed text) -----
@app.post("/gen3d_batch", response_model=BatchResp)
def gen3d_batch(req: BatchReq):
    items: List[BatchItem] = []
    for seed in req.seeds:
        key = cache_key(req.prompt, seed, req.guidance_scale, req.num_inference_steps)
        hit = cache_get(key)
        if hit:
            items.append(BatchItem(seed=seed, url=hit))
            continue
        result = safe_call_text(req.prompt, seed, req.guidance_scale, req.num_inference_steps)
        out_path = _materialize_to_models(result)
        rel = f"/{out_path.relative_to(BASE_DIR).as_posix()}"
        cache_put(key, rel)
        items.append(BatchItem(seed=seed, url=rel))
    return BatchResp(items=items)

# ----- Sessions -----
@app.post("/session/new", response_model=SessionResp)
def session_new(req: SessionCreate):
    sid = uuid.uuid4().hex
    data = {
        "id": sid,
        "title": req.title or "Untitled Session",
        "created_at": time.time(),
        "defaults": {
            "seed": req.seed,
            "guidance_scale": req.guidance_scale,
            "num_inference_steps": req.num_inference_steps,
        },
        "items": [],
    }
    _save_session(data)
    return SessionResp(id=sid, title=data["title"], created_at=data["created_at"], items=data["items"])

@app.get("/session/{session_id}", response_model=SessionResp)
def session_get(session_id: str):
    data = _load_session(session_id)
    return SessionResp(id=data["id"], title=data["title"], created_at=data["created_at"], items=data["items"])

@app.post("/session/append", response_model=GenResp)
def session_append(req: AppendReq):
    data = _load_session(req.session_id)
    params = {
        "seed": req.seed if req.seed is not None else data["defaults"]["seed"],
        "guidance_scale": req.guidance_scale if req.guidance_scale is not None else data["defaults"]["guidance_scale"],
        "num_inference_steps": req.num_inference_steps if req.num_inference_steps is not None else data["defaults"]["num_inference_steps"],
    }
    composite_prompt = _build_composite_prompt(data["items"], req.edit)

    key = cache_key(composite_prompt, params["seed"], params["guidance_scale"], params["num_inference_steps"])
    hit = cache_get(key)
    if hit:
        item = {
            "id": uuid.uuid4().hex,
            "prompt": composite_prompt,
            "params": params,
            "url": hit, 
            "created_at": time.time(),
        }
        data["items"].append(item); _save_session(data)
        return GenResp(id=item["id"], url=item["url"])

    result = safe_call_text(composite_prompt, params["seed"], params["guidance_scale"], params["num_inference_steps"])
    out_path = _materialize_to_models(result)
    rel = f"/{out_path.relative_to(BASE_DIR).as_posix()}"
    cache_put(key, rel)

    item = {
        "id": uuid.uuid4().hex,
        "prompt": composite_prompt,
        "params": params,
        "url": rel,
        "created_at": time.time(),
    }
    data["items"].append(item); _save_session(data)
    return GenResp(id=item["id"], url=item["url"])


