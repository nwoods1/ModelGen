import { create } from 'zustand';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const useModelStore = create((set, get) => ({
  currentModel: null,
  status: 'Ready.',
  progress: null,
  downloadUrl: null,
  transforms: {
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
    color: '#ffffff'
  },

  setStatus: (status) => set({ status }),
  
  setProgress: (progress) => set({ progress }),
  
  setDownloadUrl: (downloadUrl) => set({ downloadUrl }),

  updateTransforms: (newTransforms) => set((state) => ({
    transforms: { ...state.transforms, ...newTransforms }
  })),

  resetTransforms: () => set({
    transforms: {
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      color: '#ffffff'
    }
  }),

  loadModelFromUrl: async (url) => {
    const loader = new GLTFLoader();
    
    try {
      const gltf = await loader.loadAsync(url);
      const model = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
      
      // Fix materials and lighting
      model.traverse((child) => {
        if (child.isMesh) {
          // Enable shadows
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Fix normals
          if (child.geometry && !child.geometry.getAttribute('normal')) {
            child.geometry.computeVertexNormals();
          }
          
          // Fix materials
          if (child.material) {
            const materials = Array.isArray(child.material) 
              ? child.material 
              : [child.material];
            
            materials.forEach((material) => {
              // Convert unlit materials to standard
              if (material.isMeshBasicMaterial || 
                  material.name?.toLowerCase().includes('unlit') ||
                  material.userData?.KHR_materials_unlit) {
                
                const standardMaterial = new THREE.MeshStandardMaterial({
                  color: material.color || new THREE.Color(0xdddddd),
                  metalness: 0.0,
                  roughness: 0.6,
                  emissive: (material.color || new THREE.Color(0xdddddd)).clone().multiplyScalar(0.05)
                });
                
                child.material = Array.isArray(child.material) 
                  ? materials.map(m => m === material ? standardMaterial : m)
                  : standardMaterial;
              } else {
                // Fix texture color spaces
                if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
                if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
              }
            });
          }
        }
      });
      
      // Position model on ground
      const box = new THREE.Box3().setFromObject(model);
      const minY = box.min.y;
      if (Number.isFinite(minY)) {
        model.position.y -= minY;
      }
      
      set({ 
        currentModel: model,
        downloadUrl: url
      });
      
      // Reset transforms when loading new model
      get().resetTransforms();
      
      return model;
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  },

  clearModel: () => set({ 
    currentModel: null, 
    downloadUrl: null 
  }),

  // Try local edits first (scale, rotate, color)
  tryLocalEdit: (editText) => {
    const { currentModel, updateTransforms, transforms } = get();
    if (!currentModel) return false;

    const txt = (editText || '').toLowerCase();

    // Scale edits
    const scalePct = txt.match(/(bigger|larger|increase)[^0-9]*(\d+)%/) || 
                    txt.match(/scale\s*(\d+(\.\d+)?)/);
    if (scalePct) {
      const s = scalePct[2] ? 1 + +scalePct[2] / 100 : parseFloat(scalePct[1]);
      if (!isNaN(s) && s > 0) {
        updateTransforms({ scale: transforms.scale * s });
        return true;
      }
    }

    // Rotation edits
    const rot = txt.match(/rotate\s*(\d+)\s*(deg|degree|degrees)\s*(x|y|z)?/);
    if (rot) {
      const angle = parseFloat(rot[1]);
      const axis = (rot[3] || 'y').toLowerCase();
      if (!isNaN(angle)) {
        updateTransforms({
          rotation: {
            ...transforms.rotation,
            [axis]: transforms.rotation[axis] + angle
          }
        });
        return true;
      }
    }

    // Color edits
    const hex = txt.match(/#([0-9a-f]{6})/);
    const named = txt.match(/color\s+([a-z]+)/);
    if (hex || named) {
      const color = hex ? `#${hex[1]}` : named[1];
      updateTransforms({ color });
      return true;
    }

    return false;
  }
}));

export { useModelStore };