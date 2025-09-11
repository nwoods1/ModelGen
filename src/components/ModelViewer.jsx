import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { useModelStore } from '../stores/modelStore';
import * as THREE from 'three';

const ModelScene = () => {
  const { currentModel, transforms } = useModelStore();
  const modelRef = useRef();

  useEffect(() => {
    if (modelRef.current && transforms) {
      const { scale, rotation, color } = transforms;
      
      // Apply scale
      modelRef.current.scale.setScalar(scale);
      
      // Apply rotation
      modelRef.current.rotation.set(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180
      );

      // Apply color
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) 
            ? child.material 
            : [child.material];
          
          materials.forEach((material) => {
            if (material.color) {
              material.color.set(color);
            }
          });
        }
      });
    }
  }, [transforms]);

  if (!currentModel) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#666" />
      </mesh>
    );
  }

  return (
    <primitive 
      ref={modelRef}
      object={currentModel.clone()} 
      position={[0, 0, 0]}
    />
  );
};

const ModelViewer = () => {
  return (
    <div className="canvas-container">
      <Canvas
        camera={{ 
          position: [2.2, 1.6, 2.2], 
          fov: 60,
          near: 0.01,
          far: 2000
        }}
        shadows
        gl={{ 
          antialias: true, 
          alpha: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.6
        }}
      >
        <color attach="background" args={['#0b0f14']} />
        
        {/* Lighting */}
        <ambientLight intensity={0.35} />
        <hemisphereLight 
          skyColor="#ffffff" 
          groundColor="#667788" 
          intensity={0.8} 
        />
        <directionalLight
          position={[3, 5, 2]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-radius={4}
        />
        <directionalLight
          position={[-2.5, 3.0, -2.0]}
          intensity={0.5}
        />

        {/* Environment */}
        <Environment preset="studio" />

        {/* Ground with shadows */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.25}
          scale={20}
          blur={2}
          far={10}
        />

        {/* Controls */}
        <OrbitControls
          enableDamping
          target={[0, 0.6, 0]}
          maxPolarAngle={Math.PI * 0.9}
          minDistance={0.5}
          maxDistance={50}
        />

        {/* Model */}
        <Suspense fallback={null}>
          <ModelScene />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;