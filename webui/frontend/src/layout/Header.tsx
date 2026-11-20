import { motion } from "motion/react";
import { Link, NavLink } from "react-router";
import { LogoMark } from "../components/icons";
import { ModeToggle, ThemeToggle } from "../components/Toggles";
import { ROUTES } from "../scene/stations";

export function Header() {
  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
      <div className="glass mx-auto flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-3 py-2 sm:flex-nowrap sm:px-4">
        <Link to="/" className="flex items-center gap-2 rounded-xl pr-2 text-lg font-bold tracking-tight">
          <LogoMark size={30} />
          <span>
            Nexus<span className="text-gradient">Ops</span>
          </span>
        </Link>
        <nav aria-label="Main" className="order-last -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
          {ROUTES.map((route) => (
            <NavLink
              key={route.path}
              to={route.path}
              end
              className={({ isActive }) =>
                `relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors
                ${isActive ? "text-text" : "text-muted hover:text-text"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-lg border border-primary/40 bg-primary/15"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{route.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
