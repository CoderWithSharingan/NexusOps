import { Grid } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Palette } from "../theme/tokens";

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Atmosphere({ palette, reduced, lowQuality }: { palette: Palette; reduced: boolean; lowQuality: boolean }) {
  const count = lowQuality ? 500 : 1500;
  const geometry = useMemo(() => {
    const random = seeded(7);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 90;
      positions[i * 3 + 1] = random() * 26 - 6;
      positions[i * 3 + 2] = random() * -50 + 12;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [count]);
  const points = useRef<THREE.Points>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (points.current && !reduced) points.current.rotation.y += delta * 0.008;
  });

  return (
    <>
      <points ref={points} geometry={geometry}>
        <pointsMaterial color={palette.secondary} size={0.07} sizeAttenuation transparent opacity={0.75} depthWrite={false} />
      </points>
      <Grid
        position={[0, -2.2, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.6}
        sectionSize={4}
        sectionThickness={1.1}
        cellColor={palette.grid}
        sectionColor={palette.primary}
        fadeDistance={48}
        fadeStrength={1.6}
      />
    </>
  );
}
