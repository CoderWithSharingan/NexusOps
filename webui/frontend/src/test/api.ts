import { vi } from "vitest";
import type { Status } from "../api/client";

export const VALID_STATUS: Status = {
  application: "payment-api",
  config: { valid: true, errors: [] },
  plan: { fresh: false, message: "No saved plan found." },
  variables_generated: false,
  manifests_rendered: false,
  resources: { s3: true, ecr: false },
};

export const SAMPLE_CONFIG = {
  application: { name: "payment-api" },
  infrastructure: { provider: "aws", region: "ap-south-1" },
  deployment: { replicas: 2 },
  resources: { s3: { enabled: false }, ecr: { enabled: false, repository_name: "payment-api" } },
};

type Handler = (init?: RequestInit) => { status?: number; body: unknown };

/** Routes fetch calls by "METHOD /path" so tests can fake the backend. */
export function mockApi(handlers: Record<string, Handler> = {}) {
  const routes: Record<string, Handler> = {
    "GET /api/status": () => ({ body: VALID_STATUS }),
    "GET /api/config": () => ({ body: { config: SAMPLE_CONFIG } }),
    "POST /api/validate": () => ({ body: { valid: true, errors: [] } }),
    "GET /api/plan": () => ({ body: { fresh: false, message: "No saved plan found.", text: null } }),
    ...handlers,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const handler = routes[key];
    if (!handler) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
    const { status = 200, body } = handler(init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
}
