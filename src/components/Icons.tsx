import type { SVGProps } from 'react'

type IconName =
  | 'box'
  | 'database'
  | 'upload'
  | 'play'
  | 'pause'
  | 'reset'
  | 'cube'
  | 'weight'
  | 'target'
  | 'route'
  | 'warning'
  | 'check'
  | 'download'
  | 'settings'
  | 'layers'

const paths: Record<IconName, React.ReactNode> = {
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  pause: <><path d="M9 5v14"/><path d="M15 5v14"/></>,
  reset: <><path d="M4 8V3m0 0h5M4 3l4 4"/><path d="M5.5 11a7 7 0 1 0 2-4"/></>,
  cube: <><path d="m5 7 7-3 7 3-7 3-7-3Z"/><path d="m5 7 7 3 7-3v9l-7 4-7-4V7Z"/><path d="M12 10v10"/></>,
  weight: <><path d="M8 8a4 4 0 1 1 8 0"/><path d="M6 8h12l2 12H4L6 8Z"/><path d="m12 8 2-2"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3c4 0 1-7 5-7h2M6 16V8h5"/></>,
  warning: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  download: <><path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.5 3.1h5l.5-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></>,
  layers: <><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/></>,
}

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
