import type { StageState } from "../pipeline";
import { STATE_LABELS } from "../pipeline";

const COLORS: Record<StageState, string> = {
  ok: "bg-ok/15 text-ok border-ok/40",
  warn: "bg-warn/15 text-warn border-warn/40",
  error: "bg-error/15 text-error border-error/40",
  idle: "bg-idle/15 text-muted border-idle/40",
};

const DOTS: Record<StageState, string> = { ok: "bg-ok", warn: "bg-warn", error: "bg-error", idle: "bg-idle" };

export function StatusBadge({ state, label }: { state: StageState; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${COLORS[state]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[state]} ${state === "ok" ? "animate-pulse" : ""}`} />
      {label ?? STATE_LABELS[state]}
    </span>
  );
}
