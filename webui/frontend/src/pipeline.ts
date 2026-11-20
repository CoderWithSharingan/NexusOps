import type { Status } from "./api/client";

export type StageId = "yaml" | "validate" | "terraform" | "docker" | "ecr" | "kubernetes";
export type StageState = "ok" | "warn" | "error" | "idle";

export type Stage = { id: StageId; label: string; model: string; route: string; summary: string };

export const STAGES: Stage[] = [
  { id: "yaml", label: "YAML", model: "yaml", route: "/config", summary: "nexusops.yaml drives every step" },
  { id: "validate", label: "Validate", model: "validate", route: "/config", summary: "Settings checked before anything runs" },
  { id: "terraform", label: "Terraform", model: "terraform", route: "/plan", summary: "Saved plan for S3 and ECR" },
  { id: "docker", label: "Docker", model: "docker", route: "/next-steps", summary: "Local image build" },
  { id: "ecr", label: "ECR", model: "ecr", route: "/next-steps", summary: "Private container registry" },
  { id: "kubernetes", label: "Kubernetes", model: "kubernetes", route: "/kubernetes", summary: "Hardened Deployment and Service" },
];

export const STATE_LABELS: Record<StageState, string> = {
  ok: "Ready",
  warn: "Needs attention",
  error: "Blocked",
  idle: "Not active",
};

const UNREADABLE = /^(Invalid YAML|Could not read|Configuration must be|PyYAML)/;

export function stageStates(status: Status | null): Record<StageId, StageState> {
  if (!status) {
    return { yaml: "idle", validate: "idle", terraform: "idle", docker: "idle", ecr: "idle", kubernetes: "idle" };
  }
  const valid = status.config.valid;
  const unreadable = status.config.errors.some((error) => UNREADABLE.test(error));
  return {
    yaml: unreadable ? "error" : "ok",
    validate: valid ? "ok" : "error",
    terraform: !valid ? "idle" : status.plan.fresh ? "ok" : "warn",
    docker: valid ? "ok" : "idle",
    ecr: valid && status.resources.ecr ? "ok" : "idle",
    kubernetes: !valid ? "idle" : status.manifests_rendered ? "ok" : "warn",
  };
}

export function stageHint(id: StageId, status: Status | null): string {
  if (!status) return "Waiting for status…";
  const valid = status.config.valid;
  switch (id) {
    case "yaml": {
      const unreadable = status.config.errors.find((error) => UNREADABLE.test(error));
      return unreadable ?? "Configuration file loaded";
    }
    case "validate":
      return valid ? "All settings pass validation" : `${status.config.errors.length} problem(s) to fix`;
    case "terraform":
      return !valid ? "Fix the configuration first" : status.plan.fresh ? "Saved plan is up to date" : "Create a new plan in the terminal";
    case "docker":
      return valid ? "Ready to build locally from the terminal" : "Fix the configuration first";
    case "ecr":
      return status.resources.ecr ? "Push from the terminal after building" : "ECR is turned off in the config";
    case "kubernetes":
      return !valid ? "Fix the configuration first" : status.manifests_rendered ? "Manifests rendered" : "Render manifests to preview them";
  }
}
