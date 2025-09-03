// Three.js viewer utilities: init scene, load GLB, clear scene, frame camera.

import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b0f14");

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(1.8, 1.6, 2.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.6, 0);

    // lights + ground
    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.0);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.loader = new GLTFLoader();

    const animate = () => {
      this.resize();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    if (w && h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  clear() {
    while (this.root.children.length) this.root.remove(this.root.children[0]);
  }

  async loadGLB(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, (gltf) => {
        this.clear();
        this.root.add(gltf.scene);
        this.controls.target.set(0, 0.6, 0);
        this.camera.position.set(1.8, 1.6, 2.2);
        this.controls.update();
        resolve(gltf.scene);
      }, undefined, (err) => reject(err));
    });
  }
}
