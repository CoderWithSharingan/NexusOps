import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode, PointerEvent } from "react";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";
import { useVisualMode } from "../visual-mode/VisualModeProvider";

const MAX_TILT = 9;

export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { mode } = useVisualMode();
  const reduced = usePrefersReducedMotion();
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 20 };
  const rotateY = useSpring(useTransform(x, [0, 1], [-MAX_TILT, MAX_TILT]), spring);
  const rotateX = useSpring(useTransform(y, [0, 1], [MAX_TILT, -MAX_TILT]), spring);
  const shineX = useTransform(x, (value) => `${value * 100}%`);
  const shineY = useTransform(y, (value) => `${value * 100}%`);
  const shine = useTransform(
    [shineX, shineY],
    ([sx, sy]) => `radial-gradient(circle at ${sx} ${sy}, color-mix(in srgb, var(--nx-primary) 22%, transparent), transparent 55%)`,
  );
  const tilt = mode === "3d" && !reduced;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width);
    y.set((event.clientY - rect.top) / rect.height);
  };
  const onLeave = () => {
    x.set(0.5);
    y.set(0.5);
  };

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        onPointerMove={tilt ? onMove : undefined}
        onPointerLeave={tilt ? onLeave : undefined}
        style={tilt ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        whileHover={reduced ? undefined : { y: -4 }}
        className="glass group relative h-full overflow-hidden rounded-2xl"
      >
        {tilt && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: shine }}
          />
        )}
        <div style={tilt ? { transform: "translateZ(30px)" } : undefined} className="relative h-full">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
