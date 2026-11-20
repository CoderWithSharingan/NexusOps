import type { ReactNode } from "react";
import { useStatus } from "../api/StatusProvider";
import { GlassPanel } from "../components/GlassPanel";
import { StageIcon } from "../components/icons";
import { StatusBadge } from "../components/StatusBadge";
import { STAGES, stageHint, stageStates, type StageId } from "../pipeline";
import { useVisualMode } from "../visual-mode/VisualModeProvider";

/** Two-column page: the focused stage on the left (3D node or Lite card), content on the right. */
export function StagePage({
  stage,
  eyebrow,
  title,
  intro,
  children,
}: {
  stage: StageId;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  const { mode } = useVisualMode();
  const { status } = useStatus();
  const state = stageStates(status)[stage];
  const label = STAGES.find((each) => each.id === stage)?.label ?? stage;

  const heading = (
    <div>
      <p className="text-xs font-semibold tracking-[0.2em] text-secondary uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <div className="mt-3 max-w-md text-muted">{intro}</div>
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <aside className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
        {mode === "lite" ? (
          <GlassPanel className="flex flex-col gap-6 p-6">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary/25 to-secondary/25 text-primary">
                <StageIcon stage={stage} size={44} />
              </div>
              <div>
                <p className="text-lg font-semibold">{label}</p>
                <StatusBadge state={state} />
              </div>
            </div>
            {heading}
            <p className="text-sm text-muted">{stageHint(stage, status)}</p>
          </GlassPanel>
        ) : (
          <div className="flex flex-col justify-end gap-4 lg:min-h-[70vh]">
            <div className="h-40 lg:hidden" aria-hidden="true" />
            {heading}
            <div className="flex items-center gap-3 text-sm text-muted">
              <StatusBadge state={state} />
              {stageHint(stage, status)}
            </div>
          </div>
        )}
      </aside>
      <section className="flex flex-col gap-6 lg:col-span-7">{children}</section>
    </div>
  );
}
