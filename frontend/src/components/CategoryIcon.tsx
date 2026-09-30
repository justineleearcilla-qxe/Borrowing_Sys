import { ReactNode } from 'react'

const icons: Record<string, ReactNode> = {
  sports: (
    <>
      <path d="M6 3h12v6a6 6 0 0 1-12 0V3Z" />
      <path d="M6 5H3v1a4 4 0 0 0 4 4" />
      <path d="M18 5h3v1a4 4 0 0 1-4 4" />
      <path d="M12 15v4" />
      <path d="M8 21h8" />
    </>
  ),
  laboratory: (
    <>
      <path d="M10 2v7.5L4.7 20.4A1 1 0 0 0 5.6 22h12.8a1 1 0 0 0 .9-1.6L14 9.5V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </>
  ),
  'av-multimedia': (
    <>
      <rect x="2" y="6" width="13" height="12" />
      <path d="m15 10 7-4v12l-7-4" />
    </>
  ),
  'computer-it': (
    <>
      <rect x="5" y="5" width="14" height="14" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M9 2v3" />
      <path d="M15 2v3" />
      <path d="M9 19v3" />
      <path d="M15 19v3" />
      <path d="M2 9h3" />
      <path d="M2 15h3" />
      <path d="M19 9h3" />
      <path d="M19 15h3" />
    </>
  ),
  'musical-instruments': (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  'event-facility': (
    <>
      <path d="M5 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
      <path d="M3 13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-4 0v1H7v-1a2 2 0 0 0-4 0Z" />
      <path d="M5 18v3" />
      <path d="M19 18v3" />
    </>
  ),
}

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-6 w-6'}
      aria-hidden
    >
      {icons[slug] ?? icons.sports}
    </svg>
  )
}
