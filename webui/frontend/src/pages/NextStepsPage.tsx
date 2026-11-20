import { useStatus } from "../api/StatusProvider";
import { CommandLine } from "../components/Code";
import { GlassPanel } from "../components/GlassPanel";
import { StageIcon, TerminalIcon } from "../components/icons";
import { StatusBadge } from "../components/StatusBadge";
import { StagePage } from "../layout/StagePage";
import type { StageId, StageState } from "../pipeline";

type Step = { stage: StageId; title: string; command: string; detail: string; state: StageState; stateLabel: string };

export function NextStepsPage() {
  const { status } = useStatus();
  const valid = status?.config.valid ?? false;
  const ecr = status?.resources.ecr ?? false;

  const steps: Step[] = [
    {
      stage: "terraform",
      title: "Create a plan",
      command: "python run_nexusops.py plan",
      detail: "Generates Terraform variables and saves a plan. Nothing in AWS changes.",
      state: status?.plan.fresh ? "ok" : valid ? "warn" : "idle",
      stateLabel: status?.plan.fresh ? "Plan up to date" : "To do",
    },
    {
      stage: "terraform",
      title: "Review the plan",
      command: "python run_nexusops.py show-plan",
      detail: "Shows exactly what will be created. You can also read it on the Plan page.",
      state: status?.plan.fresh ? "ok" : "idle",
      stateLabel: status?.plan.fresh ? "Available" : "Needs a plan",
    },
    {
      stage: "terraform",
      title: "Apply the plan",
      command: "python run_nexusops.py apply",
      detail: "Creates real AWS resources. You must type APPLY to confirm.",
      state: status?.plan.fresh ? "warn" : "idle",
      stateLabel: "Changes AWS",
    },
    {
      stage: "terraform",
      title: "Destroy the infrastructure",
      command: "python run_nexusops.py destroy",
      detail: "Shows what will be deleted, then deletes it from AWS. You must type DESTROY to confirm.",
      state: valid ? "warn" : "idle",
      stateLabel: "Deletes AWS resources",
    },
    {
      stage: "docker",
      title: "Build the image",
      command: "python run_nexusops.py build-image",
      detail: "Builds the Docker image locally. It is never pushed by this step.",
      state: valid ? "ok" : "idle",
      stateLabel: valid ? "Ready" : "Fix config first",
    },
    {
      stage: "ecr",
      title: "Push to ECR",
      command: "python run_nexusops.py push-ecr",
      detail: ecr
        ? "Pushes the built image to your ECR repository. You must type PUSH to confirm."
        : "ECR is turned off. Enable it on the Config page and apply a plan first.",
      state: ecr ? "warn" : "idle",
      stateLabel: ecr ? "Changes AWS" : "ECR off",
    },
    {
      stage: "kubernetes",
      title: "Render Kubernetes manifests",
      command: "python run_nexusops.py render-k8s",
      detail: "Also available as a button on the Kubernetes page.",
      state: status?.manifests_rendered ? "ok" : "idle",
      stateLabel: status?.manifests_rendered ? "Rendered" : "To do",
    },
  ];

  return (
    <StagePage
      stage="docker"
      eyebrow="Terminal"
      title="Next steps"
      intro="Anything that touches AWS or Docker runs in your terminal, where NexusOps asks you to confirm it."
    >
      <GlassPanel className="flex items-start gap-3 p-5 text-sm text-muted">
        <TerminalIcon className="mt-0.5 shrink-0 text-secondary" />
        <p>
          Open a terminal in the project folder and activate the virtual environment first:{" "}
          <code className="font-mono text-text">.\.venv\Scripts\Activate.ps1</code>
        </p>
      </GlassPanel>
      <ol className="flex flex-col gap-4">
        {steps.map((step, index) => (
          <li key={step.title}>
            <GlassPanel className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
                    <StageIcon stage={step.stage} size={18} />
                  </span>
                  <h2 className="font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                    {step.title}
                  </h2>
                </div>
                <StatusBadge state={step.state} label={step.stateLabel} />
              </div>
              <p className="text-sm text-muted">{step.detail}</p>
              <CommandLine command={step.command} />
            </GlassPanel>
          </li>
        ))}
      </ol>
    </StagePage>
  );
}
