const BACKEND = "http://localhost:8000";

export const textTo3D = async ({ prompt, seed, guidance_scale, num_inference_steps, onStatus, onProgress }) => {
  onStatus?.("Sending request…");
  onProgress?.(null);
  
  const response = await fetch(`${BACKEND}/gen3d`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt ?? "a cube",
      seed: Number.isFinite(+seed) ? +seed : 0,
      guidance_scale: Number.isFinite(+guidance_scale) ? +guidance_scale : 15,
      num_inference_steps: Number.isFinite(+num_inference_steps) ? +num_inference_steps : 64,
    }),
  });
  
  if (!response.ok) {
    throw new Error(await response.text().catch(() => "Backend error"));
  }
  
  const data = await response.json();
  onStatus?.("Download ready.");
  onProgress?.(100);
  
  const absolute = data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`;
  return { url: absolute, id: data.id };
};

export const createSession = async ({ title, seed, guidance_scale, num_inference_steps }) => {
  const response = await fetch(`${BACKEND}/session/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, seed, guidance_scale, num_inference_steps }),
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  
  return response.json();
};

export const appendEdit = async ({ session_id, edit, seed, guidance_scale, num_inference_steps }) => {
  const response = await fetch(`${BACKEND}/session/append`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, edit, seed, guidance_scale, num_inference_steps }),
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  
  const data = await response.json();
  return {
    id: data.id,
    url: data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`,
  };
};

export const getSession = async (session_id) => {
  const response = await fetch(`${BACKEND}/session/${session_id}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
};

export const gen3DBatch = async ({ prompt, seeds, guidance_scale, num_inference_steps }) => {
  const response = await fetch(`${BACKEND}/gen3d_batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      seeds: Array.isArray(seeds) && seeds.length ? seeds : [0, 1, 2],
      guidance_scale: Number.isFinite(+guidance_scale) ? +guidance_scale : 15,
      num_inference_steps: Number.isFinite(+num_inference_steps) ? +num_inference_steps : 64,
    }),
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  
  const data = await response.json();
  data.items = data.items.map(item => ({
    seed: item.seed,
    url: item.url.startsWith("http") ? item.url : `${BACKEND}${item.url}`,
  }));
  
  return data;
};

export { BACKEND };