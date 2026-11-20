import { Environment, Lightformer, PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useRef, useState } from "react";
import { STAGES, type StageId, type StageState } from "../pipeline";
import type { Palette, ThemeName } from "../theme/tokens";
import { Atmosphere } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { DataBeams } from "./DataBeams";
import MODEL_NAMES from "./models.json";
import { NexusCore, PipelineNode } from "./PipelineNode";
import { LabelProjector, StageLabels } from "./StageLabels";
import { cameraFor, CORE_POSITION, STAGE_POSITIONS, type StationId } from "./stations";
import { modelUrl } from "./useThemedModel";

const MODEL_URLS = MODEL_NAMES.map(modelUrl);
MODEL_URLS.forEach((url) => useGLTF.preload(url, false, false));

export type NexusSceneProps = {
  station: StationId;
  states: Record<StageId, StageState>;
  palette: Palette;
  theme: ThemeName;
  reduced: boolean;
  onSlow: () => void;
};

export default function NexusScene({ station, states, palette, theme, reduced, onSlow }: NexusSceneProps) {
  const [lowQuality, setLowQuality] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const labels = useRef<Partial<Record<StageId, HTMLDivElement | null>>>({});

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Release cached models when switching to Lite; unmounting the Canvas frees the GPU context itself.
  useEffect(() => () => useGLTF.clear(MODEL_URLS), []);

  const dark = theme === "dark";
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10" data-testid="nexus-scene">
      <Canvas
        dpr={lowQuality ? 1 : [1, 2]}
        frameloop={visible ? "always" : "never"}
        camera={{ position: cameraFor(station).position, fov: 42, near: 0.1, far: 140 }}
        gl={{ antialias: !lowQuality, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[palette.background]} />
        <fog attach="fog" args={[palette.background, 20, 60]} />
        <ambientLight intensity={dark ? 0.35 : 0.9} />
        <directionalLight position={[6, 10, 8]} intensity={dark ? 1.4 : 1.9} />
        <pointLight position={CORE_POSITION} color={palette.primary} intensity={80} distance={32} />
        <Environment key={theme} resolution={64} frames={1}>
          <Lightformer form="ring" intensity={2.5} color={palette.primary} position={[0, 5, -9]} scale={6} />
          <Lightformer form="rect" intensity={1.6} color={palette.secondary} position={[-8, 2, 6]} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={dark ? 0.8 : 1.5} color="#ffffff" position={[6, 6, 6]} scale={[6, 6, 1]} />
        </Environment>
        <PerformanceMonitor
          flipflops={2}
          onDecline={() => {
            setLowQuality(true);
            onSlow();
          }}
          onFallback={() => setLowQuality(true)}
        />
        <Suspense fallback={null}>
          <NexusCore position={CORE_POSITION} palette={palette} reduced={reduced} />
          {STAGES.map((stage, index) => (
            <PipelineNode
              key={stage.id}
              stage={stage}
              index={index}
              position={STAGE_POSITIONS[stage.id]}
              state={states[stage.id]}
              focused={station === stage.id}
              palette={palette}
              reduced={reduced}
            />
          ))}
        </Suspense>
        <DataBeams palette={palette} reduced={reduced} />
        <Atmosphere palette={palette} reduced={reduced} lowQuality={lowQuality} />
        <CameraRig station={station} reduced={reduced} />
        <LabelProjector labels={labels} />
        {!lowQuality && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={dark ? 1.15 : 0.6} luminanceThreshold={1} luminanceSmoothing={0.3} />
          </EffectComposer>
        )}
      </Canvas>
      <div className={`transition-opacity duration-700 ${station === "overview" ? "opacity-100" : "opacity-0"}`}>
        <StageLabels
          labels={labels}
          states={states}
          colors={{ ok: palette.ok, warn: palette.warn, error: palette.error, idle: palette.idle }}
        />
      </div>
    </div>
  );
}
