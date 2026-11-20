import type { HTMLAttributes } from "react";

export function GlassPanel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass rounded-3xl ${className}`} {...props} />;
}
