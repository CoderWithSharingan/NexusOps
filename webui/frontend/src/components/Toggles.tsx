import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../theme/ThemeProvider";
import { useVisualMode } from "../visual-mode/VisualModeProvider";
import { CubeIcon, LayersIcon, MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-line bg-surface/50
        text-text transition hover:border-primary/70"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function ModeToggle() {
  const { mode, webglAvailable, setMode } = useVisualMode();
  const is3d = mode === "3d";
  const hint = webglAvailable
    ? is3d
      ? "Switch to Lite mode (no 3D, lighter on slower devices)"
      : "Switch to 3D mode"
    : "3D needs WebGL, which is not available in this browser";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={is3d}
      aria-label="3D effects"
      title={hint}
      disabled={!webglAvailable}
      onClick={() => setMode(is3d ? "lite" : "3d")}
      className="relative flex h-10 items-center rounded-xl border border-line bg-surface/50 p-1 text-xs font-semibold
        transition hover:border-primary/70"
    >
      <motion.span
        aria-hidden="true"
        layout
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-gradient-to-r from-primary to-secondary
          ${is3d ? "left-1" : "left-[calc(50%+2px)]"}`}
      />
      <span className={`relative z-10 flex items-center gap-1 px-2.5 ${is3d ? "text-white" : "text-muted"}`}>
        <CubeIcon size={15} /> 3D
      </span>
      <span className={`relative z-10 flex items-center gap-1 px-2.5 ${is3d ? "text-muted" : "text-white"}`}>
        <LayersIcon size={15} /> Lite
      </span>
    </button>
  );
}
