// app.js
import { BACKEND, createSession, appendEdit } from "./gradio_api.js";
import { viewer, loadGLB, getCurrentObject } from "./viewer.js";
import {
  createOrGetSessionDoc,
  addItemToSession,
  listSessionItems,
  listSessions,
  ensureAuth,
} from "./firebase.js";

/* ---------------- UI refs ---------------- */
const ui = {
  prompt: document.getElementById("prompt"),
  seed: document.getElementById("seed"),
  guidance: document.getElementById("guidance"),
  steps: document.getElementById("steps"),
  generate: document.getElementById("generate"),
  download: document.getElementById("download"),
  status: document.getElementById("status"),
  progress: document.getElementById("progress"),
  bar: document.querySelector("#progress .bar"),
  label: document.querySelector("#progress .label"),
  continueToggle: document.getElementById("continueToggle"),
  newChat: document.getElementById("newChat"),
  historyList: document.getElementById("historyList"),
  scale: document.getElementById("scaleSlider"),
  rotX: document.getElementById("rotX"),
  rotY: document.getElementById("rotY"),
  rotZ: document.getElementById("rotZ"),
  color: document.getElementById("colorPicker"),
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

function getSessionId() {
  return localStorage.getItem("session_id");
}
function setSessionId(id) {
  localStorage.setItem("session_id", id);
}

// Ensure a session exists (client + Firestore)
async function ensureSession({ seed, guidance_scale, num_inference_steps }) {
  let sid = getSessionId();
  if (!sid) {
    const sess = await createSession({
      title: "My 3D Session",
      seed,
      guidance_scale,
      num_inference_steps,
    });
    sid = sess.id;
    setSessionId(sid);
  }
  await createOrGetSessionDoc(sid, { seed, guidance_scale, num_inference_steps });
  return sid;
}

// Try append; if server lost session (404), create a new one and retry once
async function safeAppendEditOrCreate({ edit, seed, guidance_scale, num_inference_steps }) {
  let session_id = getSessionId();
  if (!session_id) {
    const sess = await createSession({ title: "My 3D Session", seed, guidance_scale, num_inference_steps });
    session_id = sess.id;
    setSessionId(session_id);
    await createOrGetSessionDoc(session_id, { seed, guidance_scale, num_inference_steps });
  }

  try {
    return await appendEdit({ session_id, edit, seed, guidance_scale, num_inference_steps });
  } catch (e) {
    const msg = e?.message || "";
    if (msg.includes("Session not found")) {
      const fresh = await createSession({ title: "My 3D Session", seed, guidance_scale, num_inference_steps });
      setSessionId(fresh.id);
      await createOrGetSessionDoc(fresh.id, { seed, guidance_scale, num_inference_steps });
      return await appendEdit({ session_id: fresh.id, edit, seed, guidance_scale, num_inference_steps });
    }
    throw e;
  }
}

function renderHistoryItems(items) {
  ui.historyList.innerHTML = "";
  items
    .slice()
    .reverse()
    .forEach((it) => {
      const li = document.createElement("li");
      const snip = document.createElement("div");
      snip.className = "snippet";
      snip.textContent = (it.prompt || "").replace(/\s+/g, " ").slice(0, 80);
      const btn = document.createElement("button");
      btn.textContent = "Load";
      btn.addEventListener("click", async () => {
        const absolute = it.url.startsWith("http") ? it.url : `${BACKEND}${it.url}`;
        setStatus("Loading from history…");
        await loadGLB(absolute);
        resetEditControls();
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
  if (!sid) {
    ui.historyList.innerHTML = "";
    return;
  }
  try {
    const items = await listSessionItems(sid);
    const mapped = items.map((it) => ({ prompt: it.prompt, url: it.storage_url || it.backend_url }));
    renderHistoryItems(mapped);
  } catch (e) {
    console.warn("history fetch failed", e);
  }
}

function resetEditControls() {
  if (ui.scale) ui.scale.value = 1;
  if (ui.rotX) ui.rotX.value = 0;
  if (ui.rotY) ui.rotY.value = 0;
  if (ui.rotZ) ui.rotZ.value = 0;
  if (ui.color) ui.color.value = "#ffffff";
}

function applyTransforms() {
  const root = getCurrentObject();
  if (!root) return;
  const s = parseFloat(ui.scale.value) || 1;
  root.scale.setScalar(s);
  const rx = ((parseFloat(ui.rotX.value) || 0) * Math.PI) / 180;
  const ry = ((parseFloat(ui.rotY.value) || 0) * Math.PI) / 180;
  const rz = ((parseFloat(ui.rotZ.value) || 0) * Math.PI) / 180;
  root.rotation.set(rx, ry, rz);
}

function applyColor() {
  const root = getCurrentObject();
  if (!root) return;
  const color = ui.color.value;
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => m.color && m.color.set(color));
  });
}

function tryLocalEdit(editText) {
  const root = getCurrentObject();
  if (!root) return false;

  const txt = (editText || "").toLowerCase();

  // scale: “bigger by 20%” / “scale 1.2”
  const scalePct =
    txt.match(/(bigger|larger|increase)[^0-9]*(\d+)%/) || txt.match(/scale\s*(\d+(\.\d+)?)/);
  if (scalePct) {
    const s = scalePct[2] ? 1 + +scalePct[2] / 100 : parseFloat(scalePct[1]);
    if (!isNaN(s) && s > 0) {
      root.scale.multiplyScalar(s);
      return true;
    }
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
      if (!o.material) return;
      const m = o.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.color && mm.color.set(color));
      else if (m.color) m.color.set(color);
    });
    return true;
  }

  return false;
}

/* --------------- UI wiring --------------- */

// New chat
ui.newChat.addEventListener("click", async () => {
  try {
    ui.newChat.disabled = true;
    const seed = Number(ui.seed.value) || 0;
    const guidance_scale = Number(ui.guidance.value) || 15;
    const num_inference_steps = Number(ui.steps.value) || 64;
    setStatus("Starting new chat…");
    const sess = await createSession({
      title: "My 3D Session",
      seed,
      guidance_scale,
      num_inference_steps,
    });
    setSessionId(sess.id);
    await createOrGetSessionDoc(sess.id, { seed, guidance_scale, num_inference_steps });
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

    // First: attempt a local edit if a model is already loaded
    if (tryLocalEdit(edit)) {
      setStatus("Applied local edit ✔");
      setProgress(100);
      setTimeout(clearProgress, 800);
      return;
    }

    // Ensure / optionally create a session depending on toggle
    if (ui.continueToggle.checked) {
      setStatus("Continuing this design…");
      await ensureSession({ seed, guidance_scale, num_inference_steps }); // stores session_id
    } else {
      setStatus("Starting new chat…");
      const sess = await createSession({
        title: "My 3D Session",
        seed,
        guidance_scale,
        num_inference_steps,
      });
      setSessionId(sess.id);
      await createOrGetSessionDoc(sess.id, { seed, guidance_scale, num_inference_steps });
      ui.historyList.innerHTML = "";
    }

    setStatus("Generating model…");

    // 404-proof append call
    const { id: itemId, url } = await safeAppendEditOrCreate({
      edit,
      seed,
      guidance_scale,
      num_inference_steps,
    });

    setStatus("Loading preview…");
    setProgress(95);
    await loadGLB(url);
    resetEditControls();

    // Save to Firebase (Storage + Firestore)
    const session_id = getSessionId();
    const saved = await addItemToSession({
      sessionId: session_id,
      itemId,
      prompt: edit,
      params: { seed, guidance_scale, num_inference_steps },
      backendUrl: url,
    });

    const downloadURL = saved?.storage_url || url;
    ui.download.href = downloadURL;
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

// edit panel events
[ui.scale, ui.rotX, ui.rotY, ui.rotZ].forEach((el) => {
  el && el.addEventListener("input", applyTransforms);
});
ui.color && ui.color.addEventListener("input", applyColor);

/* --------------- App init --------------- */

// Sign in anonymously first (so Firestore has a UID)
await ensureAuth();

// If “Continue” starts checked and there’s no session yet, create one now
if (ui.continueToggle && ui.continueToggle.checked && !getSessionId()) {
  const seed = Number(ui.seed.value) || 0;
  const guidance_scale = Number(ui.guidance.value) || 15;
  const num_inference_steps = Number(ui.steps.value) || 64;
  const sess = await createSession({
    title: "My 3D Session",
    seed,
    guidance_scale,
    num_inference_steps,
  });
  setSessionId(sess.id);
  await createOrGetSessionDoc(sess.id, { seed, guidance_scale, num_inference_steps });
}

setStatus("Ready.");
clearProgress();
refreshHistory();
