import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "./test/api";

const webgl = vi.hoisted(() => ({ available: true }));
vi.mock("./visual-mode/webgl", () => ({ detectWebGL: () => webgl.available }));
vi.mock("./scene/NexusScene", () => ({ default: () => <div data-testid="nexus-scene" /> }));

import { App } from "./App";

function renderApp() {
  mockApi();
  return render(<App />);
}

describe("visual mode", () => {
  it("starts in 3D and loads the scene", async () => {
    webgl.available = true;
    renderApp();
    expect(await screen.findByTestId("nexus-scene")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "3D effects" })).toHaveAttribute("aria-checked", "true");
  });

  it("remembers the Lite choice and swaps the background", async () => {
    webgl.available = true;
    renderApp();
    await userEvent.click(screen.getByRole("switch", { name: "3D effects" }));
    expect(localStorage.getItem("nexusops.visualMode")).toBe("lite");
    expect(screen.getByRole("switch", { name: "3D effects" })).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(screen.queryByTestId("nexus-scene")).not.toBeInTheDocument());
    expect(screen.getByTestId("lite-background")).toBeInTheDocument();
  });

  it("forces Lite and disables the toggle without WebGL", async () => {
    webgl.available = false;
    localStorage.setItem("nexusops.visualMode", "3d");
    renderApp();
    const toggle = screen.getByRole("switch", { name: "3D effects" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("title", expect.stringContaining("WebGL"));
    expect(screen.queryByTestId("nexus-scene")).not.toBeInTheDocument();
  });
});

describe("theme", () => {
  it("is shared across 3D and Lite modes and persisted", async () => {
    webgl.available = true;
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("nexusops.theme")).toBe("light");

    await userEvent.click(screen.getByRole("switch", { name: "3D effects" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("starts from the stored theme", () => {
    localStorage.setItem("nexusops.theme", "light");
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--nx-primary")).toBe("#6d28d9");
  });
});
