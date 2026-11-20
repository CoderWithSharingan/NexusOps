import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

export type ModelMaterials = {
  body: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
};

export const modelUrl = (name: string) => `/models/${name}.glb`;

/** Clones a cached model and swaps its body/accent/glow meshes onto theme-driven materials. */
export function useThemedModel(name: string) {
  // Draco and Meshopt stay off: drei would otherwise fetch decoders from a CDN, which the CSP blocks.
  const { scene } = useGLTF(modelUrl(name), false, false);
  const model = useMemo(() => scene.clone(true), [scene]);
  const materials = useMemo<ModelMaterials>(
    () => ({
      body: new THREE.MeshPhysicalMaterial({ metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 }),
      accent: new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }),
    [],
  );

  useLayoutEffect(() => {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.material = materials[mesh.name as keyof ModelMaterials] ?? materials.body;
    });
  }, [model, materials]);

  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);

  return { model, materials };
}
