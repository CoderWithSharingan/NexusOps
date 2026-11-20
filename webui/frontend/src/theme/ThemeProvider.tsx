import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { applyTheme, initialTheme, PALETTES, THEME_STORAGE_KEY, type Palette, type ThemeName } from "./tokens";

type ThemeContextValue = { theme: ThemeName; palette: Palette; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const value = initialTheme();
    applyTheme(value);
    return value;
  });

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, palette: PALETTES[theme], toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
