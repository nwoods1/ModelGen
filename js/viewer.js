// js/viewer.js
import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
camera.position.set(1.8, 1.2, 1.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(3, 5, 2);
scene.add(dir);

let current = null;

function resize() {
  const parent = renderer.domElement.parentElement || document.body;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (!w || !h) return;
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

function disposeObject3D(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap"].forEach((k) => {
          if (m[k] && m[k].dispose) m[k].dispose();
        });
        if (m.dispose) m.dispose();
      });
    }
  });
}

function fitToObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.6 + 0.2;

    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius, radius * 0.7, radius));
    camera.near = Math.max(0.01, radius / 1000);
    camera.far = radius * 1000;
    camera.updateProjectionMatrix();
  }
}

export async function loadGLB(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  if (current) {
    scene.remove(current);
    disposeObject3D(current);
    current = null;
  }

  current = gltf.scene || new THREE.Group();
  scene.add(current);
  fitToObject(current);
  return current;
}

export function getCurrentObject() { return current; }
export const viewer = { scene, camera, renderer, controls, loadGLB, getCurrentObject };
