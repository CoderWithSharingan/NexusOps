import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DURATION, easeCamera } from "../motion/transitions";
import { cameraFor, type StationId } from "./stations";

/** Flies the camera between stations using the same duration and easing as page transitions. */
export function CameraRig({ station, reduced }: { station: StationId; reduced: boolean }) {
  const camera = useThree((state) => state.camera);
  const narrow = useThree((state) => state.size.width < 900);
  const flight = useRef<{
    from: { position: THREE.Vector3; target: THREE.Vector3 };
    to: { position: THREE.Vector3; target: THREE.Vector3 };
    position: THREE.Vector3;
    target: THREE.Vector3;
    progress: number;
  } | null>(null);
  const pointer = useRef(new THREE.Vector2());
  const parallax = useRef(new THREE.Vector2());

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.set((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const next = cameraFor(station, narrow);
    const to = { position: new THREE.Vector3(...next.position), target: new THREE.Vector3(...next.target) };
    const current = flight.current;
    if (!current || reduced) {
      flight.current = { from: to, to, position: to.position.clone(), target: to.target.clone(), progress: 1 };
      return;
    }
    current.from = { position: current.position.clone(), target: current.target.clone() };
    current.to = to;
    current.progress = 0;
  }, [station, narrow, reduced]);

  useFrame((_, delta) => {
    const state = flight.current;
    if (!state) return;
    let lift = 0;
    if (state.progress < 1) {
      state.progress = Math.min(1, state.progress + delta / DURATION);
      const eased = easeCamera(state.progress);
      state.position.lerpVectors(state.from.position, state.to.position, eased);
      state.target.lerpVectors(state.from.target, state.to.target, eased);
      lift = Math.sin(Math.PI * eased) * 2.5;
    }
    const strength = reduced ? 0 : 1;
    parallax.current.x = THREE.MathUtils.damp(parallax.current.x, pointer.current.x * 0.9 * strength, 3, delta);
    parallax.current.y = THREE.MathUtils.damp(parallax.current.y, pointer.current.y * 0.5 * strength, 3, delta);
    camera.position.set(
      state.position.x + parallax.current.x,
      state.position.y + lift + parallax.current.y,
      state.position.z,
    );
    camera.lookAt(state.target);
  });

  return null;
}
