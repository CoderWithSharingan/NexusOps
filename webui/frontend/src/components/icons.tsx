import type { ReactElement, SVGProps } from "react";
import type { StageId } from "../pipeline";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const STAGE_PATHS: Record<StageId, ReactElement> = {
  yaml: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 11h6M11 14h5M11 17h3" />
    </>
  ),
  validate: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  terraform: (
    <>
      <path d="M4 16h16v3H4zM6 11h12v3H6zM8 6h8v3H8z" />
    </>
  ),
  docker: (
    <>
      <path d="M3 15h18l-2 4H5z" />
      <path d="M5 11h4v4H5zM10 11h4v4h-4zM15 11h4v4h-4zM7.5 7h4v4h-4zM12.5 7h4v4h-4z" />
    </>
  ),
  ecr: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 14.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  kubernetes: (
    <>
      <path d="m12 2.5 7.4 3.6 1.8 8-5.1 6.4H7.9L2.8 14.1l1.8-8z" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 6.5V10M16.6 9.6 13.9 11.2M15 16.4l-2-2.6M9 16.4l2-2.6M7.4 9.6l2.7 1.6" />
    </>
  ),
};

export function StageIcon({ stage, ...props }: IconProps & { stage: StageId }) {
  return <Svg {...props}>{STAGE_PATHS[stage]}</Svg>;
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="nx-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--nx-primary)" />
          <stop offset="1" stopColor="var(--nx-secondary)" />
        </linearGradient>
      </defs>
      <path d="M32 4 56 18v28L32 60 8 46V18z" fill="none" stroke="url(#nx-logo)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 42V22l20 20V22" fill="none" stroke="url(#nx-logo)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const SunIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);

export const CubeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 2.5 8 4.5v10l-8 4.5-8-4.5V7z" />
    <path d="m4 7 8 4.5L20 7M12 11.5v10" />
  </Svg>
);

export const LayersIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

export const CopyIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);

export const TerminalIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3M13 15h4" />
  </Svg>
);
