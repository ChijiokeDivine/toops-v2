// src/components/pocket-dice/dice-cup.tsx
'use client'

import { useId } from 'react'
import { TileGlyph } from '@/components/mines/icons'

/**
 * The shaker, drawn upright (mouth up) on a 200×280 grid. The stage rotates the
 * whole element, so every pose comes from this one piece of artwork.
 *
 * Glossy black cylinder, a raised lip band, a base band and the toops tile
 * glyph glowing on the side.
 */
export function DiceCup({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const url = (name: string) => `url(#${id(name)})`

  const body = 'M28 40 L38 250 A62 16 0 0 0 162 250 L172 40 Z'

  return (
    <svg
      viewBox="0 0 200 280"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={id('body')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#040506" />
          <stop offset="0.13" stopColor="#12181a" />
          <stop offset="0.3" stopColor="#161d20" />
          <stop offset="0.47" stopColor="#0f1417" />
          <stop offset="0.8" stopColor="#080b0c" />
          <stop offset="1" stopColor="#030405" />
        </linearGradient>
        <linearGradient id={id('shade')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id={id('band')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#060809" />
          <stop offset="0.2" stopColor="#10161a" />
          <stop offset="0.33" stopColor="#222c30" />
          <stop offset="0.55" stopColor="#0c1114" />
          <stop offset="0.85" stopColor="#0a0d0f" />
          <stop offset="1" stopColor="#040506" />
        </linearGradient>
        <linearGradient id={id('lip')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#3a4549" />
          <stop offset="0.45" stopColor="#151b1e" />
          <stop offset="1" stopColor="#07090a" />
        </linearGradient>
        <linearGradient id={id('wall')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#38454a" />
          <stop offset="0.45" stopColor="#141b1e" />
          <stop offset="1" stopColor="#020303" />
        </linearGradient>
        <linearGradient id={id('logo')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#8dffb4" />
          <stop offset="1" stopColor="#1fd868" />
        </linearGradient>
        <clipPath id={id('clip')}>
          <path d={body} />
        </clipPath>
        <filter id={id('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Body */}
      <path d={body} fill={url('body')} />
      <path d={body} fill={url('shade')} />
      <g clipPath={url('clip')} filter={url('soft')}>
        <rect x="47" y="40" width="9" height="230" fill="#bfeee0" opacity="0.05" />
        <rect x="136" y="40" width="5" height="230" fill="#6fe0b0" opacity="0.04" />
      </g>

      {/* Base band */}
      <path
        d="M36.5 224 A63.5 15 0 0 0 163.5 224 L163 252 A62.5 15.5 0 0 1 37 252 Z"
        fill={url('band')}
      />
      <path
        d="M36.5 224 A63.5 15 0 0 0 163.5 224"
        fill="none"
        stroke="#000"
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />
      <path
        d="M37 252 A62.5 15.5 0 0 0 163 252"
        fill="none"
        stroke="#9fe9d2"
        strokeOpacity="0.1"
        strokeWidth="1"
      />

      {/* Upper band */}
      <path d="M24 40 L25.5 70 A74.5 19 0 0 0 174.5 70 L176 40 Z" fill={url('band')} />
      <path
        d="M25.5 70 A74.5 19 0 0 0 174.5 70"
        fill="none"
        stroke="#000"
        strokeOpacity="0.7"
        strokeWidth="1.6"
      />
      <path
        d="M27 73 A73 18.5 0 0 0 173 73"
        fill="none"
        stroke="#9fe9d2"
        strokeOpacity="0.09"
        strokeWidth="1"
      />

      {/* Logo: the mines tile glyph, glowing. */}
      <g transform="translate(100 152) scale(0.93 1) translate(-100 -152)">
        <TileGlyph
          x="64"
          y="118"
          width="72"
          height="72"
          style={{ color: '#34f58a', filter: `url(#${id('blur')})`, opacity: 0.85 }}
        />
        <svg x="64" y="118" width="72" height="72" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 6.5 40.5 16 24 23.3 7.5 16Z" fill="#7dffae" opacity="0.34" />
          <path d="M7.5 16 24 23.3v18.2L7.5 32Z" fill="#1fd868" opacity="0.16" />
          <path d="M24 23.3 40.5 16v16L24 41.5Z" fill="#1fd868" opacity="0.26" />
        </svg>
        <TileGlyph
          x="64"
          y="118"
          width="72"
          height="72"
          style={{ color: '#5dfb9a' }}
          stroke={url('logo')}
        />
      </g>

      {/* Mouth: lip, chamfer, inner wall and the dark depth below. */}
      <ellipse cx="100" cy="40" rx="76" ry="26" fill={url('lip')} />
      <ellipse cx="100" cy="40" rx="76" ry="26" fill="none" stroke="#c5f3e6" strokeOpacity="0.14" />
      <ellipse cx="100" cy="41" rx="66" ry="22" fill="#05080a" />
      <ellipse cx="100" cy="41.5" rx="61" ry="19.5" fill={url('wall')} />
      <ellipse cx="100" cy="48" rx="50" ry="11" fill="#010202" opacity="0.72" />
      <path
        d="M39.5 41.5 A61 19.5 0 0 1 100 22"
        fill="none"
        stroke="#d6f6ec"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
