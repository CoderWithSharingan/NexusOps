export function LiteBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg" data-testid="lite-background">
      <div
        className="nx-drift absolute -top-1/4 -left-1/4 h-[70vmax] w-[70vmax] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--nx-primary), transparent 65%)" }}
      />
      <div
        className="nx-drift-slow absolute -right-1/4 -bottom-1/3 h-[65vmax] w-[65vmax] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--nx-secondary), transparent 65%)" }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(var(--nx-grid) 1px, transparent 1px), linear-gradient(90deg, var(--nx-grid) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 50% 40%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, #000 20%, transparent 75%)",
        }}
      />
    </div>
  );
}
