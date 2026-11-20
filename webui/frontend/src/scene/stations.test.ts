import { describe, expect, it } from "vitest";
import { STAGES } from "../pipeline";
import MODEL_NAMES from "./models.json";
import { cameraFor, ROUTES, STAGE_POSITIONS, stationFor } from "./stations";

describe("stations and models", () => {
  it("has a model for every stage plus the hub", () => {
    expect(new Set(MODEL_NAMES)).toEqual(new Set(["nexus-core", ...STAGES.map((stage) => stage.model)]));
  });

  it("maps every route to a camera station with finite coordinates", () => {
    for (const route of ROUTES) {
      const station = stationFor(route.path);
      expect(station).toBe(route.station);
      for (const narrow of [false, true]) {
        const { position, target } = cameraFor(station, narrow);
        expect([...position, ...target].every(Number.isFinite)).toBe(true);
      }
    }
    expect(stationFor("/unknown")).toBe("overview");
  });

  it("positions every stage and routes each stage to a page", () => {
    const paths = new Set(ROUTES.map((route) => route.path));
    for (const stage of STAGES) {
      expect(STAGE_POSITIONS[stage.id]).toHaveLength(3);
      expect(paths.has(stage.route)).toBe(true);
    }
  });
});
