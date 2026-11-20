import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StatusProvider } from "../api/StatusProvider";
import { ToastProvider } from "../components/Toast";
import { mockApi } from "../test/api";
import { ThemeProvider } from "../theme/ThemeProvider";
import { VisualModeProvider } from "../visual-mode/VisualModeProvider";
import { assignErrors, ConfigPage } from "./ConfigPage";

vi.mock("../visual-mode/webgl", () => ({ detectWebGL: () => false }));

const REPLICA_ERROR = "'deployment.replicas' must be an integer from 1 to 20.";

function renderPage() {
  return render(
    <ThemeProvider>
      <VisualModeProvider>
        <ToastProvider>
          <StatusProvider>
            <MemoryRouter>
              <ConfigPage />
            </MemoryRouter>
          </StatusProvider>
        </ToastProvider>
      </VisualModeProvider>
    </ThemeProvider>,
  );
}

describe("ConfigPage", () => {
  it("shows backend validation errors next to the field and blocks saving", async () => {
    const fetchMock = mockApi({
      "POST /api/validate": (init) => {
        const replicas = JSON.parse(String(init?.body)).config.deployment.replicas;
        return { body: replicas > 20 ? { valid: false, errors: [REPLICA_ERROR] } : { valid: true, errors: [] } };
      },
    });
    renderPage();
    const replicas = await screen.findByLabelText("Replicas");
    fireEvent.change(replicas, { target: { value: "25" } });

    expect(await screen.findByText(REPLICA_ERROR)).toBeInTheDocument();
    expect(replicas).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("saves a valid change", async () => {
    const fetchMock = mockApi({ "PUT /api/config": () => ({ body: { saved: true } }) });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Replicas"), { target: { value: "4" } });
    const save = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(String(put?.[1]?.body)).config.deployment.replicas).toBe(4);
    });
  });
});

describe("assignErrors", () => {
  it("routes messages to fields and keeps unknown ones general", () => {
    const { byField, general } = assignErrors([REPLICA_ERROR, "A bucket_name is required when S3 is enabled.", "Something else."]);
    expect(byField["deployment.replicas"]).toEqual([REPLICA_ERROR]);
    expect(byField["resources.s3.bucket_name"]).toHaveLength(1);
    expect(general).toEqual(["Something else."]);
  });
});
