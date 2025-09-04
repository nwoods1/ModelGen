// js/gradio_api.js
const BACKEND = "http://localhost:8000";

// --- one-off generation (optional) ---
export async function textTo3D({ prompt, seed, guidance_scale, num_inference_steps, onStatus, onProgress }) {
  onStatus?.("Sending request…");
  onProgress?.(null);
  const r = await fetch(`${BACKEND}/gen3d`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      prompt: prompt ?? "a cube",
      seed: Number.isFinite(+seed) ? +seed : 0,
      guidance_scale: Number.isFinite(+guidance_scale) ? +guidance_scale : 15,
      num_inference_steps: Number.isFinite(+num_inference_steps) ? +num_inference_steps : 64,
    }),
  });
  if (!r.ok) throw new Error(await r.text().catch(()=>"Backend error"));
  const data = await r.json();
  onStatus?.("Download ready.");
  onProgress?.(100);
  const absolute = data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`;
  return { url: absolute, id: data.id };
}

// --- sessions API ---
export async function createSession({ title, seed, guidance_scale, num_inference_steps }) {
  const r = await fetch(`${BACKEND}/session/new`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ title, seed, guidance_scale, num_inference_steps }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { id, title, created_at, items: [] }
}

export async function appendEdit({ session_id, edit, seed, guidance_scale, num_inference_steps }) {
  const r = await fetch(`${BACKEND}/session/append`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ session_id, edit, seed, guidance_scale, num_inference_steps }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json(); // { id, url: "/static/models/..." }
  return {
    id: data.id,
    url: data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`,
  };
}

export async function getSession(session_id) {
  const r = await fetch(`${BACKEND}/session/${session_id}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { id, title, created_at, items: [...] }
}

export async function gen3DBatch({ prompt, seeds, guidance_scale, num_inference_steps }) {
  const BACKEND = "http://localhost:8000";
  const r = await fetch(`${BACKEND}/gen3d_batch`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      prompt,
      seeds: Array.isArray(seeds) && seeds.length ? seeds : [0,1,2],
      guidance_scale: Number.isFinite(+guidance_scale) ? +guidance_scale : 15,
      num_inference_steps: Number.isFinite(+num_inference_steps) ? +num_inference_steps : 64,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json(); // { items: [{seed,url}, ...] }
  // map to absolute URLs
  data.items = data.items.map(it => ({
    seed: it.seed,
    url: it.url.startsWith("http") ? it.url : `${BACKEND}${it.url}`,
  }));
  return data;
}
