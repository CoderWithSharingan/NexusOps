import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";

const INTERACTIVE = 'a, button, select, summary, label[for], [role="switch"], [role="button"], [data-interactive]';
const TEXT_ENTRY = 'input:not([type="checkbox"], [type="radio"], [type="range"]), textarea, [contenteditable="true"]';

function useFinePointer() {
  const [fine, setFine] = useState(() => window.matchMedia("(pointer: fine)").matches);
  useEffect(() => {
    const query = window.matchMedia("(pointer: fine)");
    const onChange = () => setFine(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return fine;
}

/** The arrow itself is a CSS cursor (see index.css); this adds the spring-following accent ring. */
export function CustomCursor() {
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const spring = { stiffness: 520, damping: 38, mass: 0.6 };
  const springX = useSpring(x, spring);
  const springY = useSpring(y, spring);
  const [visible, setVisible] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    if (!fine) return;
    const root = document.documentElement;
    root.classList.add("nx-cursor");

    const onMove = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
      const target = event.target as Element | null;
      setVisible(!target?.closest(TEXT_ENTRY));
      setHovering(Boolean(target?.closest(INTERACTIVE)));
    };
    const onDown = (event: PointerEvent) => {
      root.classList.add("nx-pressing");
      if (!reduced) setRipples((all) => [...all.slice(-3), { id: event.timeStamp, x: event.clientX, y: event.clientY }]);
    };
    const onUp = () => root.classList.remove("nx-pressing");
    const onLeave = () => setVisible(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      root.classList.remove("nx-cursor", "nx-pressing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [fine, reduced, x, y]);

  if (!fine) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]" data-testid="cursor-layer" data-reduced={reduced}>
      <motion.div
        className="absolute top-0 left-0 rounded-full border-2"
        style={{
          x: reduced ? x : springX,
          y: reduced ? y : springY,
          width: 34,
          height: 34,
          marginLeft: -17,
          marginTop: -17,
          borderColor: "color-mix(in srgb, var(--nx-secondary) 70%, transparent)",
          boxShadow: "0 0 18px color-mix(in srgb, var(--nx-primary) 55%, transparent)",
        }}
        animate={{ scale: hovering ? 1.55 : 1, opacity: visible ? (hovering ? 0.95 : 0.55) : 0 }}
        transition={{ duration: reduced ? 0 : 0.25 }}
      />
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="absolute rounded-full border-2 border-primary"
            style={{ left: ripple.x - 20, top: ripple.y - 20, width: 40, height: 40 }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onAnimationComplete={() => setRipples((all) => all.filter((each) => each.id !== ripple.id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
