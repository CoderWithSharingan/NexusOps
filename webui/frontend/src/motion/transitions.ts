import type { Variants } from "motion/react";

// Pages and the 3D camera share this timing so panels and camera flights move together.
export const DURATION = 1.1;
export const EASE = [0.65, 0, 0.35, 1] as const;

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const sample = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      t = (low + high) / 2;
      if (sample(x1, x2, t) < x) low = t;
      else high = t;
    }
    return sample(y1, y2, t);
  };
}

export const easeCamera = cubicBezier(...EASE);

const exitTiming = { duration: DURATION * 0.35, ease: EASE };
const enterTiming = { duration: DURATION * 0.65, ease: EASE, delay: DURATION * 0.35 };

export const PAGE_VARIANTS: Record<"3d" | "lite" | "reduced", Variants> = {
  "3d": {
    initial: { opacity: 0, y: 48, rotateX: 14, scale: 0.94, filter: "blur(10px)" },
    enter: { opacity: 1, y: 0, rotateX: 0, scale: 1, filter: "blur(0px)", transition: enterTiming },
    exit: { opacity: 0, y: -24, rotateX: -10, scale: 0.92, filter: "blur(10px)", transition: exitTiming },
  },
  lite: {
    initial: { opacity: 0, y: 18 },
    enter: { opacity: 1, y: 0, transition: enterTiming },
    exit: { opacity: 0, y: -12, transition: exitTiming },
  },
  reduced: {
    initial: { opacity: 0 },
    enter: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  },
};
