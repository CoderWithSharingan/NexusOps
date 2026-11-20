import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { STAGES } from "../pipeline";
import type { Palette } from "../theme/tokens";
import { CORE_POSITION, STAGE_POSITIONS } from "./stations";

const PACKETS_PER_LINK = 3;

function buildCurves() {
  const points = STAGES.map((stage) => new THREE.Vector3(...STAGE_POSITIONS[stage.id]));
  const links = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const middle = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.1, 0.6));
    return new THREE.CatmullRomCurve3([start, middle, end]);
  });
  const core = new THREE.Vector3(...CORE_POSITION);
  const spokes = points.map((point) => {
    const control = core.clone().lerp(point, 0.5).add(new THREE.Vector3(0, 2.2, 0));
    return new THREE.QuadraticBezierCurve3(core, control, point);
  });
  return { links, spokes };
}

/** Beams between pipeline stages and from the hub, with packets of "data" flowing along them. */
export function DataBeams({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const { links, spokes } = useMemo(buildCurves, []);
  const geometries = useMemo(
    () => ({
      links: links.map((curve) => new THREE.TubeGeometry(curve, 64, 0.035, 8, false)),
      spokes: spokes.map((curve) => new THREE.TubeGeometry(curve, 48, 0.012, 6, false)),
    }),
    [links, spokes],
  );
  const linkMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false }), []);
  const spokeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22 }), []);
  const packets = useRef<THREE.InstancedMesh>(null);
  const curves = useMemo(
    () => [...links.flatMap((curve) => Array.from({ length: PACKETS_PER_LINK }, () => curve)), ...spokes],
    [links, spokes],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    linkMaterial.color.set(palette.primary).multiplyScalar(1.4);
    spokeMaterial.color.set(palette.secondary);
    const mesh = packets.current;
    if (!mesh) return;
    const color = new THREE.Color();
    curves.forEach((_, index) => {
      color.set(index % 2 ? palette.secondary : palette.primary).multiplyScalar(3);
      mesh.setColorAt(index, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [palette, linkMaterial, spokeMaterial, curves]);

  useEffect(
    () => () => {
      [...geometries.links, ...geometries.spokes].forEach((geometry) => geometry.dispose());
      linkMaterial.dispose();
      spokeMaterial.dispose();
    },
    [geometries, linkMaterial, spokeMaterial],
  );

  useFrame(({ clock }) => {
    const mesh = packets.current;
    if (!mesh) return;
    const speed = reduced ? 0.02 : 0.16;
    curves.forEach((curve, index) => {
      const progress = (clock.elapsedTime * speed + index / PACKETS_PER_LINK + index * 0.137) % 1;
      dummy.position.copy(curve.getPointAt(progress));
      dummy.scale.setScalar(index >= links.length * PACKETS_PER_LINK ? 0.6 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {geometries.links.map((geometry, index) => (
        <mesh key={`link-${index}`} geometry={geometry} material={linkMaterial} />
      ))}
      {geometries.spokes.map((geometry, index) => (
        <mesh key={`spoke-${index}`} geometry={geometry} material={spokeMaterial} />
      ))}
      <instancedMesh ref={packets} args={[undefined, undefined, curves.length]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
