import { useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../api/client";
import { useStatus } from "../api/StatusProvider";
import { Button } from "../components/Button";
import { StageIcon } from "../components/icons";
import { StatusBadge } from "../components/StatusBadge";
import { TiltCard } from "../components/TiltCard";
import { useToast } from "../components/Toast";
import { PipelineStrip } from "../lite/PipelineStrip";
import { STAGES, stageHint, stageStates } from "../pipeline";
import { useVisualMode } from "../visual-mode/VisualModeProvider";

export function Dashboard() {
  const { status, error, refresh } = useStatus();
  const { mode } = useVisualMode();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const states = stageStates(status);

  const generate = async () => {
    setBusy(true);
    try {
      await api.generate();
      toast({ tone: "ok", message: "Terraform variables generated. Create a fresh plan in the terminal next." });
    } catch (caught) {
      toast({ tone: "error", message: caught instanceof ApiError ? caught.message : "Could not generate variables." });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-8">
      <section className="max-w-2xl pt-4 sm:pt-10">
        <p className="text-xs font-semibold tracking-[0.25em] text-secondary uppercase">AWS DevOps automation</p>
        <h1 className="mt-3 text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
          Your pipeline, <span className="text-gradient">one YAML file</span> away.
        </h1>
        <p className="mt-5 text-lg text-muted">
          NexusOps turns <code className="font-mono text-text">nexusops.yaml</code> into Terraform, Docker, ECR and Kubernetes.
          Edit your settings here, check them instantly, and see exactly what to run next.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/config"
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-primary to-secondary px-5 py-2.5 text-sm font-semibold
              text-white shadow-lg shadow-primary/30 transition hover:brightness-110"
          >
            Edit configuration
          </Link>
          <Button onClick={generate} disabled={busy || !status?.config.valid}>
            {busy ? "Generating…" : "Generate Terraform variables"}
          </Button>
          {status?.application && (
            <span className="rounded-full border border-line bg-surface/50 px-3 py-1 font-mono text-xs text-muted">
              app: <span className="text-text">{status.application}</span>
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}
      </section>

      {mode === "lite" ? <PipelineStrip states={states} /> : <div className="min-h-[14rem] flex-1" aria-hidden="true" />}

      <section aria-label="Pipeline status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => (
          <TiltCard key={stage.id}>
            <Link to={stage.route} className="flex h-full flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <StageIcon stage={stage.id} />
                </span>
                <StatusBadge state={states[stage.id]} />
              </div>
              <div>
                <h2 className="font-semibold">{stage.label}</h2>
                <p className="mt-1 text-xs text-muted">{stageHint(stage.id, status)}</p>
              </div>
            </Link>
          </TiltCard>
        ))}
      </section>
    </div>
  );
}
