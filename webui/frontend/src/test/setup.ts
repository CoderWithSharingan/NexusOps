import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

export const mediaMatches: Record<string, boolean> = {};

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: mediaMatches[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const key of Object.keys(mediaMatches)) delete mediaMatches[key];
  document.documentElement.className = "";
  vi.restoreAllMocks();
});
