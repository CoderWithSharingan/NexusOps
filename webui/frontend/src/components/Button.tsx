import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:brightness-110",
  ghost: "border border-line bg-surface/40 text-text hover:border-primary/70 hover:bg-surface/70",
};

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition
        duration-300 active:scale-[0.97] disabled:opacity-45 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
