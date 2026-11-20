import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import { STAGES, STATE_LABELS, type StageId, type StageState } from "../pipeline";
import { STAGE_POSITIONS } from "./stations";

const LABEL_OFFSET_Y = -1.75;

export type LabelRefs = RefObject<Partial<Record<StageId, HTMLDivElement | null>>>;

/** Inside the Canvas: projects stage positions to screen space and moves the DOM labels. */
export function LabelProjector({ labels }: { labels: LabelRefs }) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const stage of STAGES) {
      const element = labels.current?.[stage.id];
      if (!element) continue;
      const [x, y, z] = STAGE_POSITIONS[stage.id];
      point.set(x, y + LABEL_OFFSET_Y, z).project(camera);
      const hidden = point.z > 1;
      element.style.opacity = hidden ? "0" : "1";
      element.style.transform = `translate3d(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px, 0) translate(-50%, -50%)`;
    }
  });
  return null;
}

/** Outside the Canvas: plain DOM labels, so no nested React roots need tearing down with the scene. */
export function StageLabels({
  labels,
  states,
  colors,
}: {
  labels: LabelRefs;
  states: Record<StageId, StageState>;
  colors: Record<StageState, string>;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {STAGES.map((stage) => (
        <div
          key={stage.id}
          ref={(element) => {
            if (labels.current) labels.current[stage.id] = element;
          }}
          className="glass absolute top-0 left-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap opacity-0 select-none"
        >
          <span className="text-text">{stage.label}</span>
          <span className="ml-2" style={{ color: colors[states[stage.id]] }}>
            {STATE_LABELS[states[stage.id]]}
          </span>
        </div>
      ))}
    </div>
  );
}
