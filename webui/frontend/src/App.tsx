import { MotionConfig } from "motion/react";
import { BrowserRouter } from "react-router";
import { StatusProvider } from "./api/StatusProvider";
import { ToastProvider } from "./components/Toast";
import { AppShell } from "./layout/AppShell";
import { ThemeProvider } from "./theme/ThemeProvider";
import { VisualModeProvider } from "./visual-mode/VisualModeProvider";

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <VisualModeProvider>
          <ToastProvider>
            <StatusProvider>
              <BrowserRouter>
                <AppShell />
              </BrowserRouter>
            </StatusProvider>
          </ToastProvider>
        </VisualModeProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
