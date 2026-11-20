import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Status } from "./client";

type StatusContextValue = { status: Status | null; error: string | null; refresh: () => Promise<void> };

const StatusContext = createContext<StatusContextValue | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load status.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return <StatusContext.Provider value={{ status, error, refresh }}>{children}</StatusContext.Provider>;
}

export function useStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error("useStatus must be used inside StatusProvider");
  return value;
}
