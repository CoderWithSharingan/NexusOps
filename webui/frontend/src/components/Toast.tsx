import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "info" | "ok" | "error"; actions?: { label: string; onClick: () => void }[] };
type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TONES = { info: "border-primary/50", ok: "border-ok/60", error: "border-error/60" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);
  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all, { ...toast, id }]);
      if (!toast.actions) window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className={`glass pointer-events-auto rounded-2xl border-l-4 p-4 text-sm ${TONES[toast.tone]}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <p>{toast.message}</p>
              {toast.actions && (
                <div className="mt-3 flex gap-2">
                  {toast.actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="rounded-lg border border-line px-3 py-1 text-xs font-semibold hover:border-primary/70"
                      onClick={() => {
                        action.onClick();
                        dismiss(toast.id);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
