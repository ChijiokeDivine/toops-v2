// src/components/pocket-dice/dice-plate.tsx
import { TileGlyph } from '@/components/mines/icons'
import { PLATE_VIEW } from './roll-choreography'

type Point = readonly [number, number]

/** A polygon with rounded corners, as an SVG path. */
function roundedPolygon(points: readonly Point[], radius: number): string {
  const count = points.length
  const parts: string[] = []
  points.forEach((point, index) => {
    const prev = points[(index + count - 1) % count] as Point
    const next = points[(index + 1) % count] as Point
    const toward = (to: Point, r: number): Point => {
      const dx = to[0] - point[0]
      const dy = to[1] - point[1]
      const length = Math.hypot(dx, dy)
      return [point[0] + (dx / length) * r, point[1] + (dy / length) * r]
    }
    const start = toward(prev, radius)
    const end = toward(next, radius)
    parts.push(
      `${index === 0 ? 'M' : 'L'}${start[0].toFixed(1)} ${start[1].toFixed(1)}`,
      `Q${point[0]} ${point[1]} ${end[0].toFixed(1)} ${end[1].toFixed(1)}`,
    )
  })
  return `${parts.join(' ')}Z`
}

const CENTER: Point = [280, 235]
const OUTER: Point[] = [
  [280, 18],
  [542, 126.5],
  [542, 343.5],
  [280, 452],
  [18, 343.5],
  [18, 126.5],
]

function scaled(points: readonly Point[], factor: number, dx: number, dy: number): Point[] {
  return points.map(([x, y]) => [
    CENTER[0] + (x - CENTER[0]) * factor + dx,
    CENTER[1] + (y - CENTER[1]) * factor + 5 + dy,
  ])
}

const OUTER_PATH = roundedPolygon(OUTER, 40)
const INNER_PATH = roundedPolygon(scaled(OUTER, 0.82, 0, 10), 30)

/**
 * The hexagon table the dice land on: a raised plate with a recessed floor and
 * the toops tile glyph watermarked in the middle. It fills its parent and
 * scales with `meet`, which is exactly how roll-choreography sizes it.
 */
export function DicePlate({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${PLATE_VIEW.w} ${PLATE_VIEW.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="pd-plate-top" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#151b23" />
          <stop offset="1" stopColor="#11171e" />
        </linearGradient>
        <linearGradient id="pd-plate-rim" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#3a4b5e" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="pd-plate-floor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0e1318" />
          <stop offset="1" stopColor="#121820" />
        </linearGradient>
        <linearGradient id="pd-plate-well" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#06090c" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#0b1015" stopOpacity="0.6" />
          <stop offset="1" stopColor="#222e3b" stopOpacity="0.7" />
        </linearGradient>
        <filter id="pd-plate-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <path
        d={OUTER_PATH}
        transform="translate(0 18)"
        fill="#04070a"
        opacity="0.85"
        filter="url(#pd-plate-blur)"
      />
      <path d={OUTER_PATH} transform="translate(0 9)" fill="#090d12" />
      <path d={OUTER_PATH} fill="url(#pd-plate-top)" />
      <path d={OUTER_PATH} fill="none" stroke="url(#pd-plate-rim)" strokeWidth="2" />

      <path d={INNER_PATH} fill="url(#pd-plate-floor)" />
      <path d={INNER_PATH} fill="none" stroke="url(#pd-plate-well)" strokeWidth="3" />

      {/* Watermark: the mines tile glyph, squashed onto the table plane. */}
      <svg x="198" y="176" width="164" height="132" viewBox="0 0 48 48" preserveAspectRatio="none">
        <path d="M24 6.5 40.5 16v16L24 41.5 7.5 32V16L24 6.5Z" fill="#19222b" />
        <path d="M24 6.5 40.5 16 24 23.3 7.5 16Z" fill="#1d2833" />
        <path d="M24 23.3 40.5 16v16L24 41.5Z" fill="#202c38" />
      </svg>
      <TileGlyph
        x="198"
        y="176"
        width="164"
        height="132"
        preserveAspectRatio="none"
        style={{ color: '#26323f' }}
      />
    </svg>
  )
}
