import type { NexusConfig } from "./api/client";

export function getIn(config: NexusConfig, path: string[]): unknown {
  return path.reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    config,
  );
}

export function setIn(config: NexusConfig, path: string[], value: unknown): NexusConfig {
  const next = structuredClone(config);
  let cursor = next as Record<string, unknown>;
  for (const key of path.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}
