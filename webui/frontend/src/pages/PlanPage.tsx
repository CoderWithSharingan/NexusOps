import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type PlanResult } from "../api/client";
import { Button } from "../components/Button";
import { CodeViewer, CommandLine } from "../components/Code";
import { GlassPanel } from "../components/GlassPanel";
import { StatusBadge } from "../components/StatusBadge";
import { StagePage } from "../layout/StagePage";

export function PlanPage() {
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlan(await api.plan());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StagePage
      stage="terraform"
      eyebrow="Terraform"
      title="Infrastructure plan"
      intro="A read-only view of the saved plan. NexusOps only shows a plan that still matches your configuration and Terraform files."
    >
      <GlassPanel className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Saved plan</h2>
            {plan && <StatusBadge state={plan.fresh ? "ok" : "warn"} label={plan.fresh ? "Up to date" : "Not available"} />}
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {plan && !plan.fresh && (
          <>
            <p className="text-sm text-muted">{plan.message}</p>
            <p className="text-sm">Create a new plan in a terminal. It never changes AWS:</p>
            <CommandLine command="python run_nexusops.py plan" />
          </>
        )}
        {plan?.fresh && plan.text && <CodeViewer code={plan.text} title="nexusops.tfplan" maxHeight="34rem" />}
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Applying stays in the terminal</h2>
        <p className="text-sm text-muted">
          Applying changes real AWS resources, so the website cannot do it. In the terminal, NexusOps shows this exact plan,
          asks you to type <code className="font-mono text-text">APPLY</code>, and checks the plan is still current before running it.
        </p>
        <CommandLine command="python run_nexusops.py apply" />
      </GlassPanel>
    </StagePage>
  );
}
