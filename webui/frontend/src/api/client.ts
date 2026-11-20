export type Status = {
  application: string | null;
  config: { valid: boolean; errors: string[] };
  plan: { fresh: boolean; message: string };
  variables_generated: boolean;
  manifests_rendered: boolean;
  resources: { s3: boolean; ecr: boolean };
};

export type NexusConfig = Record<string, unknown>;

export type PlanResult = { fresh: boolean; message: string; text: string | null };

export class ApiError extends Error {
  constructor(public status: number, public errors: string[]) {
    super(errors.join(" ") || `Request failed with status ${status}.`);
  }
}

function errorsFrom(body: unknown): string[] {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return [detail];
  if (Array.isArray(detail)) return detail.map((item) => String((item as { msg?: unknown }).msg ?? item));
  const errors = (detail as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? errors.map(String) : [];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, ["Cannot reach the NexusOps server. Is 'python run_nexusops.py ui' running?"]);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorsFrom(body));
  return body as T;
}

export const api = {
  status: () => request<Status>("/api/status"),
  getConfig: () => request<{ config: NexusConfig }>("/api/config"),
  saveConfig: (config: NexusConfig) =>
    request<{ saved: boolean }>("/api/config", { method: "PUT", body: JSON.stringify({ config }) }),
  validate: (config: NexusConfig) =>
    request<{ valid: boolean; errors: string[] }>("/api/validate", { method: "POST", body: JSON.stringify({ config }) }),
  generate: () => request<{ variables: Record<string, unknown> }>("/api/generate", { method: "POST" }),
  renderKubernetes: () => request<{ manifests: string }>("/api/render-k8s", { method: "POST" }),
  plan: () => request<PlanResult>("/api/plan"),
};
