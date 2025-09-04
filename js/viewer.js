// js/viewer.js
import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "https://esm.sh/three@0.161.0/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

// ▶️ Correct color & tone mapping (big brightness/contrast boost)
renderer.outputColorSpace = THREE.SRGBColorSpace;     // replaces outputEncoding
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;                   // tweak 1.2–2.0 if needed

// ▶️ Soft shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
// scene.background = new THREE.Color(0xf4f6f8);      // uncomment for a light bg

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);
camera.position.set(2.2, 1.6, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

/* ---------- Lights (brighter + nicer) ---------- */
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xffffff, 0x667788, 0.8);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 5, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 4;
scene.add(key);

// Optional rim fill
const rim = new THREE.DirectionalLight(0xffffff, 0.5);
rim.position.set(-2.5, 3.0, -2.0);
scene.add(rim);

/* ---------- Environment (no external HDR needed) ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

/* ---------- Shadow-catcher ground (transparent) ---------- */
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

let current = null;

/* ---------- Resize / Animate ---------- */
function resize() {
  const parent = renderer.domElement.parentElement || document.body;
  const w = parent.clientWidth || window.innerWidth;
  const h = parent.clientHeight || Math.max(420, window.innerHeight * 0.7);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

/* ---------- Utils ---------- */
function disposeObject3D(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap"].forEach((k) => {
          if (m[k]?.dispose) m[k].dispose();
        });
        m.dispose?.();
      });
    }
  });
}

function fitToObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z);

    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius * 1.6, radius * 1.1, radius * 1.6));
    camera.near = Math.max(0.01, radius / 200);
    camera.far = radius * 200;
    camera.updateProjectionMatrix();
  }
}

// Ensure lights affect the model even if exported unlit, fix textures/normals
function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;

    // normals for proper lighting
    const g = o.geometry;
    if (g && !g.getAttribute("normal")) g.computeVertexNormals();

    // shadow flags
    o.castShadow = true;
    o.receiveShadow = true;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      let m = mats[i];
      if (!m) continue;

      const isUnlit =
        m.isMeshBasicMaterial ||
        m.name?.toLowerCase().includes("unlit") ||
        m.userData?.KHR_materials_unlit;

      if (isUnlit) {
        const base = (m.color && m.color.clone()) || new THREE.Color(0xdddddd);
        const std = new THREE.MeshStandardMaterial({
          color: base,
          metalness: 0.0,
          roughness: 0.6,
          emissive: base.clone().multiplyScalar(0.05), // tiny lift for dark assets
        });
        mats[i] = std;
      } else {
        // PBR texture color space fix
        ["map", "emissiveMap"].forEach((k) => {
          if (m[k]) m[k].colorSpace = THREE.SRGBColorSpace;
        });
      }
    }

    if (Array.isArray(o.material)) o.material = mats;
  });
}

/* ---------- Loader ---------- */
export async function loadGLB(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
  fixMaterials(root);

  // replace previous
  if (current) {
    scene.remove(current);
    disposeObject3D(current);
    current = null;
  }
  current = root;
  scene.add(current);

  // sit on ground (y = 0)
  const bb = new THREE.Box3().setFromObject(current);
  const minY = bb.min.y;
  if (Number.isFinite(minY)) current.position.y -= minY;

  fitToObject(current);
  return current;
}

export function getCurrentObject() { return current; }
export const viewer = { scene, camera, renderer, controls, loadGLB, getCurrentObject };
