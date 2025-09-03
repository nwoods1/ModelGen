// app.js
import { createSession, appendEdit, getSession, imageTo3D } from "./gradio_api.js";
import { viewer, loadGLB, getCurrentObject } from "./viewer.js";

/* ---------------- UI refs ---------------- */
const ui = {
  prompt: document.getElementById("prompt"),
  seed: document.getElementById("seed"),
  guidance: document.getElementById("guidance"),
  steps: document.getElementById("steps"),
  generate: document.getElementById("generate"),
  download: document.getElementById("download"),
  status: document.getElementById("status"),
  // viewer canvas is managed inside viewer.js via <canvas id="viewport">
  progress: document.getElementById("progress"),
  bar: document.querySelector("#progress .bar"),
  label: document.querySelector("#progress .label"),
  continueToggle: document.getElementById("continueToggle"),
  newChat: document.getElementById("newChat"),
  historyList: document.getElementById("historyList"),
  modeRadios: document.querySelectorAll('input[name="mode"]'),
  imageUploader: document.getElementById("imageUploader"),
  imageFile: document.getElementById("imageFile"),
  imagePreview: document.getElementById("imagePreview"),
};

/* --------------- helpers --------------- */
function setStatus(msg) {
  ui.status.textContent = msg || "";
}

function setProgress(pctOrNull) {
  // supports either a custom bar (.bar/.label) or a <progress> element
  if (ui.bar) {
    if (pctOrNull == null) {
      ui.bar.style.width = "0%";
      ui.label && (ui.label.textContent = "working…");
    } else {
      const pct = Math.max(0, Math.min(100, Math.round(pctOrNull)));
      ui.bar.style.width = pct + "%";
      ui.label && (ui.label.textContent = pct + "%");
    }
  }
  if (ui.progress && "value" in ui.progress) {
    if (pctOrNull == null) {
      ui.progress.removeAttribute("value");
    } else {
      ui.progress.value = Math.max(0, Math.min(100, Math.round(pctOrNull)));
    }
  }
}

function clearProgress() {
  if (ui.bar) ui.bar.style.width = "0%";
  if (ui.label) ui.label.textContent = "";
  if (ui.progress && "value" in ui.progress) ui.progress.value = 0;
}

function getSessionId(){ return localStorage.getItem("session_id"); }
function setSessionId(id){ localStorage.setItem("session_id", id); }

async function ensureSession({ seed, guidance_scale, num_inference_steps }) {
  let sid = getSessionId();
  if (!sid) {
    const sess = await createSession({ title: "My 3D Session", seed, guidance_scale, num_inference_steps });
    sid = sess.id;
    setSessionId(sid);
  }
  return sid;
}

function renderHistoryItems(items) {
  ui.historyList.innerHTML = "";
  items.slice().reverse().forEach((it) => {
    const li = document.createElement("li");
    const snip = document.createElement("div");
    snip.className = "snippet";
    snip.textContent = (it.prompt || "").replace(/\s+/g, " ").slice(0, 80);
    const btn = document.createElement("button");
    btn.textContent = "Load";
    btn.addEventListener("click", async () => {
      const absolute = it.url.startsWith("http") ? it.url : `http://localhost:8000${it.url}`;
      setStatus("Loading from history…");
      await loadGLB(absolute);
      ui.download.href = absolute;
      ui.download.download = "model.glb";
      setStatus("Loaded ✔");
    });
    li.appendChild(snip);
    li.appendChild(btn);
    ui.historyList.appendChild(li);
  });
}

async function refreshHistory() {
  const sid = getSessionId();
  if (!sid) { ui.historyList.innerHTML = ""; return; }
  try {
    const sess = await getSession(sid);
    renderHistoryItems(sess.items || []);
  } catch (e) {
    console.warn("history fetch failed", e);
  }
}

function getMode() {
  const el = Array.from(ui.modeRadios).find(r => r.checked);
  return el ? el.value : "text";
}

/* -------- local edit (no re-gen) --------
   Edits act on the currently loaded model (from viewer.js)
------------------------------------------*/
function tryLocalEdit(editText) {
  const root = getCurrentObject();
  if (!root) return false;

  const txt = (editText || "").toLowerCase();

  // scale: “bigger by 20%” / “scale 1.2”
  const scalePct = txt.match(/(bigger|larger|increase)[^0-9]*(\d+)%/) || txt.match(/scale\s*(\d+(\.\d+)?)/);
  if (scalePct) {
    const s = scalePct[2] ? 1 + (+scalePct[2] / 100) : parseFloat(scalePct[1]);
    if (!isNaN(s) && s > 0) { root.scale.multiplyScalar(s); return true; }
  }

  // rotate: “rotate 90 deg y”
  const rot = txt.match(/rotate\s*(\d+)\s*(deg|degree|degrees)\s*(x|y|z)?/);
  if (rot) {
    const angle = (parseFloat(rot[1]) * Math.PI) / 180;
    const axis = (rot[3] || "y").toLowerCase();
    if (axis === "x") root.rotation.x += angle;
    else if (axis === "z") root.rotation.z += angle;
    else root.rotation.y += angle;
    return true;
  }

  // color: “color blue” / “#ff8800”
  const hex = txt.match(/#([0-9a-f]{6})/);
  const named = txt.match(/color\s+([a-z]+)/);
  if (hex || named) {
    const color = hex ? `#${hex[1]}` : named[1];
    root.traverse((o) => {
      if (o.material) {
        const m = o.material;
        if (Array.isArray(m)) m.forEach(mm => mm.color && mm.color.set(color));
        else if (m.color) m.color.set(color);
      }
    });
    return true;
  }

  return false;
}

/* --------------- UI wiring --------------- */

// Toggle uploader visibility by mode
ui.modeRadios.forEach(r => {
  r.addEventListener("change", () => {
    const mode = getMode();
    ui.imageUploader.hidden = mode !== "image";
  });
});
ui.imageUploader.hidden = getMode() !== "image";

// Image preview
ui.imageFile?.addEventListener("change", () => {
  const f = ui.imageFile.files?.[0];
  if (!f) { ui.imagePreview.hidden = true; return; }
  const img = ui.imagePreview.querySelector("img");
  img.src = URL.createObjectURL(f);
  ui.imagePreview.hidden = false;
});

// New chat
ui.newChat.addEventListener("click", async () => {
  try {
    ui.newChat.disabled = true;
    const seed = Number(ui.seed.value) || 0;
    const guidance_scale = Number(ui.guidance.value) || 15;
    const num_inference_steps = Number(ui.steps.value) || 64;
    setStatus("Starting new chat…");
    const sess = await createSession({ title: "My 3D Session", seed, guidance_scale, num_inference_steps });
    setSessionId(sess.id);
    ui.historyList.innerHTML = "";
    setStatus("New chat ready.");
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    ui.newChat.disabled = false;
  }
});

// Generate / Edit
ui.generate.addEventListener("click", async () => {
  try {
    ui.generate.disabled = true;
    const edit = (ui.prompt.value || "").trim() || "Create a simple low-poly object.";
    const seed = Number(ui.seed.value) || 0;
    const guidance_scale = Number(ui.guidance.value) || 15;
    const num_inference_steps = Number(ui.steps.value) || 64;

    setProgress(null);

    const mode = getMode();

    // IMAGE MODE → /image3d
    if (mode === "image") {
      const file = ui.imageFile.files?.[0];
      if (!file) { setStatus("Please choose an image."); return; }

      try {
        setStatus("Generating from image…");
        const { url } = await imageTo3D({
          file,
          seed, guidance_scale, num_inference_steps,
          onStatus: (msg) => setStatus(msg),
          onProgress: (pct) => setProgress(pct),
        });

        setStatus("Loading preview…");
        setProgress(95);
        await loadGLB(url);
        ui.download.href = url;
        ui.download.download = "model.glb";
        setProgress(100);
        setStatus("Done ✔");
      } catch (e) {
        console.error(e);
        setStatus(`Error: ${e.message || e}`);
      } finally {
        ui.generate.disabled = false;
        setTimeout(clearProgress, 1000);
      }
      return;
    }

    // TEXT MODE
    // First: attempt a local edit if a model is already loaded
    if (tryLocalEdit(edit)) {
      setStatus("Applied local edit ✔");
      setProgress(100);
      setTimeout(clearProgress, 800);
      return;
    }

    // Otherwise, call the backend (session flow)
    let session_id;
    if (ui.continueToggle.checked) {
      setStatus("Continuing this design…");
      session_id = await ensureSession({ seed, guidance_scale, num_inference_steps });
    } else {
      setStatus("Starting new chat…");
      const sess = await createSession({ title: "My 3D Session", seed, guidance_scale, num_inference_steps });
      session_id = sess.id;
      setSessionId(session_id);
      ui.historyList.innerHTML = "";
    }

    setStatus("Generating model…");
    const { url } = await appendEdit({ session_id, edit, seed, guidance_scale, num_inference_steps });

    setStatus("Loading preview…");
    setProgress(95);
    await loadGLB(url);

    ui.download.href = url;
    ui.download.download = "model.glb";
    setProgress(100);
    setStatus("Done ✔ (saved to history)");
    refreshHistory();
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    ui.generate.disabled = false;
    setTimeout(clearProgress, 1200);
  }
});

/* --------------- init --------------- */
setStatus("Ready.");
clearProgress();
refreshHistory();
