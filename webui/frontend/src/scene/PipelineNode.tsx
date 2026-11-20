import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Stage, StageState } from "../pipeline";
import type { Palette } from "../theme/tokens";
import type { Vec3 } from "./stations";
import { useThemedModel } from "./useThemedModel";

const STATE_KEYS: Record<StageState, keyof Palette> = { ok: "ok", warn: "warn", error: "error", idle: "idle" };

type Props = {
  stage: Stage;
  index: number;
  position: Vec3;
  state: StageState;
  focused: boolean;
  palette: Palette;
  reduced: boolean;
};

export function PipelineNode({ stage, index, position, state, focused, palette, reduced }: Props) {
  const { model, materials } = useThemedModel(stage.model);
  const group = useRef<THREE.Group>(null);
  const glow = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    materials.body.color.set(palette.modelBody);
    materials.accent.color.set(state === "idle" ? palette.idle : palette.primary);
    materials.accent.emissive.set(palette.primary);
    materials.accent.emissiveIntensity = state === "idle" ? 0 : 0.25;
  }, [materials, palette, state]);

  useFrame(({ clock }, delta) => {
    const node = group.current;
    if (!node) return;
    const time = clock.elapsedTime + index * 1.3;
    node.scale.setScalar(THREE.MathUtils.damp(node.scale.x, focused ? 1.3 : 1, 4, delta));
    if (!reduced) {
      node.rotation.y += delta * (focused ? 0.5 : 0.2);
      node.position.y = position[1] + Math.sin(time * 0.8) * 0.18;
    }
    const pulse = reduced || state === "idle" ? 1 : 0.85 + Math.sin(time * 2.4) * 0.3;
    // Values above 1 exceed the bloom threshold so only the glow parts bloom.
    glow.set(palette[STATE_KEYS[state]]).multiplyScalar((state === "idle" ? 0.7 : 2.6) * pulse);
    materials.glow.color.copy(glow);
  });

  return (
    <group ref={group} position={position}>
      <primitive object={model} />
    </group>
  );
}

export function NexusCore({ position, palette, reduced }: { position: Vec3; palette: Palette; reduced: boolean }) {
  const { model, materials } = useThemedModel("nexus-core");
  const group = useRef<THREE.Group>(null);
  const glow = useMemo(() => new THREE.Color(), []);
  const secondary = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    materials.body.color.set(palette.modelBody);
    materials.body.emissive.set(palette.primary);
    materials.body.emissiveIntensity = 0.15;
    materials.accent.color.set(palette.secondary);
    materials.accent.emissive.set(palette.secondary);
    materials.accent.emissiveIntensity = 0.6;
  }, [materials, palette]);

  useFrame(({ clock }, delta) => {
    const node = group.current;
    if (!node) return;
    if (!reduced) {
      node.rotation.y += delta * 0.15;
      node.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.15;
    }
    const mix = reduced ? 0.5 : (Math.sin(clock.elapsedTime * 0.9) + 1) / 2;
    glow.set(palette.primary).lerp(secondary.set(palette.secondary), mix).multiplyScalar(3);
    materials.glow.color.copy(glow);
  });

  return (
    <group ref={group} position={position} scale={1.6}>
      <primitive object={model} />
    </group>
  );
}
