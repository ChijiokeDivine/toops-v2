import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function TileGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M24 6.5 40.5 16v16L24 41.5 7.5 32V16L24 6.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M24 6.5v16.8M24 23.3 40.5 16M24 23.3 7.5 16M24 23.3v18.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.65"
      />
    </svg>
  )
}

export function GemIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M24 7.5 39 20.5 24 40.5 9 20.5 24 7.5Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M9 20.5h30M17 20.5 24 7.5l7 13M17 20.5l7 20 7-20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.75"
      />
    </svg>
  )
}

export function BombIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <circle cx="22" cy="28" r="11.5" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M30.5 18.5c2.4-2.4 4.6-2.2 6.2-3.7M36.7 14.8c.3-3 2.2-4.9 4.8-4.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="m17 22.5 3.5 3.5M27 34.5l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M24 7.5 38 13v10.5c0 8.4-5.5 13.9-14 17-8.5-3.1-14-8.6-14-17V13l14-5.5Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="m17.5 24 4.5 4.7L31 18.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ShieldOutlineIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3.2 20 6v5.4c0 4.6-3.2 7.6-8 9.4-4.8-1.8-8-4.8-8-9.4V6l8-2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.6V12l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect
        x="3.2"
        y="6.2"
        width="17.6"
        height="12.4"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M3.2 9.4h17.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.6" cy="14.2" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="m6.5 6.5 11 11M17.5 6.5l-11 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="m5.5 12.5 4.4 4.5 8.6-9.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
