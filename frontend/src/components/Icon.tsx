import { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  box: (
    <>
      <path d="M12 2 2.5 7v10L12 22l9.5-5V7L12 2Z" />
      <path d="M2.5 7 12 12l9.5-5" />
      <path d="M12 12v10" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="18" />
      <path d="M9 4a3 3 0 0 1 6 0" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h5l2 3h4l2-3h5" />
      <path d="M5 5h14l2 8v6H3v-6l2-8Z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3z" />
      <path d="M21 14v3" />
      <path d="M14 21h3" />
      <path d="M21 21h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 16v-5" />
      <path d="M13 16V8" />
      <path d="M18 16v-8" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H4V3h5" />
      <path d="M15 16l5-4-5-4" />
      <path d="M20 12H9" />
    </>
  ),
  menu: (
    <>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </>
  ),
  close: (
    <>
      <path d="m5 5 14 14" />
      <path d="M19 5 5 19" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 14h10l1-14" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v12H4V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5" />
      <path d="M12 18h.01" />
    </>
  ),
  check: (
    <>
      <path d="m4 12 5 5L20 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: (
    <>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
};

export function Icon({
  name,
  className,
}: {
  name: keyof typeof paths | string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {paths[name] ?? paths.box}
    </svg>
  );
}
