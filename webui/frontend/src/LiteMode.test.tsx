import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mockApi } from "./test/api";

// Own test file so the module registry is fresh and the scene import can be observed.
const scene = vi.hoisted(() => ({ imported: false }));
vi.mock("./visual-mode/webgl", () => ({ detectWebGL: () => true }));
vi.mock("./scene/NexusScene", () => {
  scene.imported = true;
  return { default: () => <div data-testid="nexus-scene" /> };
});

import { App } from "./App";

it("never downloads the 3D scene in Lite mode", async () => {
  localStorage.setItem("nexusops.visualMode", "lite");
  mockApi();
  render(<App />);
  expect(screen.getByTestId("lite-background")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("payment-api")).toBeInTheDocument());
  expect(scene.imported).toBe(false);
});
