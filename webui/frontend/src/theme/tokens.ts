export type ThemeName = "dark" | "light";

export type Palette = {
  background: string;
  surface: string;
  border: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  ok: string;
  error: string;
  warn: string;
  idle: string;
  grid: string;
  modelBody: string;
};

// Single source of colour: exposed as CSS variables for Tailwind and read directly by 3D materials.
export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    background: "#070815",
    surface: "#12142b",
    border: "#2b2f5c",
    primary: "#8b5cf6",
    secondary: "#22d3ee",
    text: "#e9eaff",
    muted: "#9ba1c9",
    ok: "#34d399",
    error: "#f87171",
    warn: "#fbbf24",
    idle: "#4b5074",
    grid: "#272a55",
    modelBody: "#3d4280",
  },
  light: {
    background: "#f3f1ff",
    surface: "#ffffff",
    border: "#d9d3fb",
    primary: "#6d28d9",
    secondary: "#0d9488",
    text: "#1b1640",
    muted: "#5a5682",
    ok: "#059669",
    error: "#dc2626",
    warn: "#c26b06",
    idle: "#a9a6c9",
    grid: "#d3cbf7",
    modelBody: "#e7e3ff",
  },
};

export const THEME_STORAGE_KEY = "nexusops.theme";

export function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const [name, value] of Object.entries(PALETTES[theme])) {
    root.style.setProperty(`--nx-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
}

export function initialTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
