import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { detectWebGL } from "./webgl";

export type VisualMode = "3d" | "lite";

export const MODE_STORAGE_KEY = "nexusops.visualMode";

type VisualModeContextValue = {
  mode: VisualMode;
  webglAvailable: boolean;
  setMode: (mode: VisualMode) => void;
};

const VisualModeContext = createContext<VisualModeContextValue | null>(null);

export function VisualModeProvider({ children }: { children: ReactNode }) {
  const [webglAvailable] = useState(detectWebGL);
  const [preferred, setPreferred] = useState<VisualMode>(() =>
    localStorage.getItem(MODE_STORAGE_KEY) === "lite" ? "lite" : "3d",
  );

  const setMode = useCallback((next: VisualMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, next);
    setPreferred(next);
  }, []);

  const mode: VisualMode = webglAvailable ? preferred : "lite";
  return (
    <VisualModeContext.Provider value={{ mode, webglAvailable, setMode }}>{children}</VisualModeContext.Provider>
  );
}

export function useVisualMode() {
  const value = useContext(VisualModeContext);
  if (!value) throw new Error("useVisualMode must be used inside VisualModeProvider");
  return value;
}
