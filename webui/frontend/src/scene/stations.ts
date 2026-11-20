import type { StageId } from "../pipeline";

export type Vec3 = [number, number, number];
export type StationId = "overview" | StageId;

export const STAGE_POSITIONS: Record<StageId, Vec3> = {
  yaml: [-10, 0, 1.5],
  validate: [-6, 0.8, -1],
  terraform: [-2, 0, 1.5],
  docker: [2, 0.8, -1],
  ecr: [6, 0, 1.5],
  kubernetes: [10, 0.8, -1],
};

export const CORE_POSITION: Vec3 = [3.5, 4.6, -9];

export const ROUTES: { path: string; label: string; station: StationId }[] = [
  { path: "/", label: "Dashboard", station: "overview" },
  { path: "/config", label: "Config", station: "yaml" },
  { path: "/plan", label: "Plan", station: "terraform" },
  { path: "/kubernetes", label: "Kubernetes", station: "kubernetes" },
  { path: "/next-steps", label: "Next steps", station: "docker" },
];

export function stationFor(pathname: string): StationId {
  return ROUTES.find((route) => route.path === pathname)?.station ?? "overview";
}

// On wide screens the focused stage sits upper-left, clear of the heading below it and the content panel on the right.
export function cameraFor(station: StationId, narrow = false): { position: Vec3; target: Vec3 } {
  if (station === "overview") {
    return narrow ? { position: [0, 11, 40], target: [0, 3, 0] } : { position: [0, 8, 25], target: [0, 3.4, 0] };
  }
  const [x, y, z] = STAGE_POSITIONS[station];
  if (narrow) return { position: [x, y + 2.5, z + 13], target: [x, y - 1, z] };
  return { position: [x + 3.7, y + 2.5, z + 12], target: [x + 3.7, y - 1.4, z] };
}
