import { Link } from "react-router";
import { StageIcon } from "../components/icons";
import { STAGES, STATE_LABELS, type StageId, type StageState } from "../pipeline";

const STROKES: Record<StageState, string> = {
  ok: "var(--nx-ok)",
  warn: "var(--nx-warn)",
  error: "var(--nx-error)",
  idle: "var(--nx-idle)",
};

/** Flat SVG version of the 3D pipeline, used in Lite mode. */
export function PipelineStrip({ states, focus }: { states: Record<StageId, StageState>; focus?: StageId }) {
  return (
    <nav aria-label="Pipeline stages" className="glass rounded-3xl px-4 py-6 sm:px-8">
      <ol className="relative grid grid-cols-3 gap-y-6 sm:grid-cols-6">
        <svg className="absolute top-7 left-[8%] hidden h-1 w-[84%] sm:block" preserveAspectRatio="none" viewBox="0 0 100 2" aria-hidden="true">
          <line x1="0" y1="1" x2="100" y2="1" stroke="var(--nx-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line
            className="nx-flow"
            x1="0"
            y1="1"
            x2="100"
            y2="1"
            stroke="var(--nx-secondary)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {STAGES.map((stage) => {
          const state = states[stage.id];
          const focused = focus === stage.id;
          return (
            <li key={stage.id} className="relative flex flex-col items-center text-center">
              <Link
                to={stage.route}
                className={`grid h-14 w-14 place-items-center rounded-2xl border-2 bg-surface transition duration-300
                  hover:-translate-y-1 ${focused ? "scale-110 shadow-lg shadow-primary/40" : ""}`}
                style={{ borderColor: STROKES[state], color: STROKES[state] }}
                aria-label={`${stage.label}: ${STATE_LABELS[state]}`}
              >
                <StageIcon stage={stage.id} size={24} />
              </Link>
              <span className={`mt-2 text-xs font-semibold ${focused ? "text-text" : "text-muted"}`}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
