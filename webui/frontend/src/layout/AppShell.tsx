import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useCallback, useRef } from "react";
import { Route, Routes, useLocation } from "react-router";
import { useStatus } from "../api/StatusProvider";
import { useToast } from "../components/Toast";
import { CustomCursor } from "../cursor/CustomCursor";
import { LiteBackground } from "../lite/LiteBackground";
import { PAGE_VARIANTS } from "../motion/transitions";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";
import { ConfigPage } from "../pages/ConfigPage";
import { Dashboard } from "../pages/Dashboard";
import { KubernetesPage } from "../pages/KubernetesPage";
import { NextStepsPage } from "../pages/NextStepsPage";
import { PlanPage } from "../pages/PlanPage";
import { stageStates } from "../pipeline";
import { stationFor } from "../scene/stations";
import { useTheme } from "../theme/ThemeProvider";
import { useVisualMode } from "../visual-mode/VisualModeProvider";
import { Header } from "./Header";
import { SceneBoundary } from "./SceneBoundary";

// Separate chunk: Lite mode never downloads three.js, the 3D libraries or the models.
const NexusScene = lazy(() => import("../scene/NexusScene"));

export function AppShell() {
  const location = useLocation();
  const { mode, setMode } = useVisualMode();
  const { palette, theme } = useTheme();
  const { status } = useStatus();
  const toast = useToast();
  const reduced = usePrefersReducedMotion();
  const slowWarned = useRef(false);

  const onSlow = useCallback(() => {
    if (slowWarned.current) return;
    slowWarned.current = true;
    toast({
      tone: "info",
      message: "3D effects are running slowly on this device. Switch to Lite mode for a smoother experience?",
      actions: [
        { label: "Switch to Lite", onClick: () => setMode("lite") },
        { label: "Keep 3D", onClick: () => undefined },
      ],
    });
  }, [setMode, toast]);

  const onSceneError = useCallback(() => {
    toast({ tone: "error", message: "3D could not start in this browser, so the Lite background is shown instead." });
  }, [toast]);

  const variants = reduced ? PAGE_VARIANTS.reduced : PAGE_VARIANTS[mode];

  return (
    <>
      <AnimatePresence>
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.6 }}
          className="fixed inset-0 -z-10"
        >
          {mode === "3d" ? (
            <SceneBoundary fallback={<LiteBackground />} onError={onSceneError}>
              <Suspense fallback={<LiteBackground />}>
                <NexusScene
                  station={stationFor(location.pathname)}
                  states={stageStates(status)}
                  palette={palette}
                  theme={theme}
                  reduced={reduced}
                  onSlow={onSlow}
                />
              </Suspense>
            </SceneBoundary>
          ) : (
            <LiteBackground />
          )}
        </motion.div>
      </AnimatePresence>

      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6" style={{ perspective: 1600 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={variants}
            initial="initial"
            animate="enter"
            exit="exit"
            style={{ transformOrigin: "50% 0%" }}
          >
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/kubernetes" element={<KubernetesPage />} />
              <Route path="/next-steps" element={<NextStepsPage />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      <CustomCursor />
    </>
  );
}
