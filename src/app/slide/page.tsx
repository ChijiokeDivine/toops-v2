import type { Metadata } from 'next'
import { Montserrat, Roboto } from 'next/font/google'
import type { CSSProperties } from 'react'

import { DeckView } from './deck-view'
import deckJson from './deck.json'
import './slide.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--deck-font-montserrat',
})

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--deck-font-roboto',
})

export const metadata: Metadata = {
  title: 'Toops - BLAZE 2026 deck',
  description: 'The full Toops BCH BLAZE 2026 project presentation, rendered slide by slide.',
}

type Run = {
  t?: string
  b?: boolean
  i?: boolean
  u?: boolean
  sz?: number
  color?: string
  font?: string
  href?: string
  br?: boolean
}

type Para = {
  align?: string | null
  bullet?: string | null
  defaultSz?: number | null
  runs: Run[]
}

type Insets = { l: number; t: number; r: number; b: number }
type Crop = { l: number; t: number; r: number; b: number }
type Base = { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }

type ImageEl = Base & { kind: 'image'; src: string; crop?: Crop }
type ShapeEl = Base & { kind: 'shape'; preset?: string | null; fill?: string | null; fillAlpha?: number | null }
type TextEl = Base & {
  kind: 'text'
  preset?: string | null
  fill?: string | null
  fillAlpha?: number | null
  anchor?: string | null
  insets: Insets
  paras: Para[]
}
type El = ImageEl | ShapeEl | TextEl
type Slide = {
  index: number
  bg: { type: 'image'; src: string } | { type: 'color'; color: string } | null
  elements: El[]
}
type Deck = { width: number; height: number; slides: Slide[] }

const deck = deckJson as unknown as Deck
const W = deck.width
const H = deck.height

/** PowerPoint stores sizes in hundredths of a point; the slide is 720pt wide. */
const ptToCqw = (sz: number) => `${(sz / 720).toFixed(4)}cqw`
const pctW = (v: number) => `${((v / W) * 100).toFixed(4)}%`
const pctH = (v: number) => `${((v / H) * 100).toFixed(4)}%`

const ALIGN: Record<string, CSSProperties['textAlign']> = {
  l: 'left',
  ctr: 'center',
  r: 'right',
  just: 'justify',
}

const FONT_VAR: Record<string, string> = {
  Roboto: 'var(--deck-font-roboto)',
  Montserrat: 'var(--deck-font-montserrat)',
}

function fillColor(color?: string | null, alpha?: number | null): string | undefined {
  if (!color) return undefined
  if (alpha == null || alpha >= 1) return color
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function boxStyle(el: El): CSSProperties {
  const style: CSSProperties = {
    position: 'absolute',
    left: pctW(el.x),
    top: pctH(el.y),
    width: pctW(el.w),
    height: pctH(el.h),
  }
  const transforms: string[] = []
  if (el.flipH || el.flipV) transforms.push(`scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`)
  if (el.rot) transforms.push(`rotate(${el.rot}deg)`)
  if (transforms.length > 0) {
    style.transform = transforms.join(' ')
    style.transformOrigin = 'center'
  }
  return style
}

function ImageView({ el }: { el: ImageEl }) {
  const crop = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const scaleX = 1 / (1 - crop.l - crop.r)
  const scaleY = 1 / (1 - crop.t - crop.b)
  return (
    <div style={{ ...boxStyle(el), overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={el.src}
        alt=""
        style={{
          position: 'absolute',
          left: `${-crop.l * scaleX * 100}%`,
          top: `${-crop.t * scaleY * 100}%`,
          width: `${scaleX * 100}%`,
          height: `${scaleY * 100}%`,
        }}
      />
    </div>
  )
}

function ShapeView({ el }: { el: ShapeEl }) {
  return (
    <div
      style={{
        ...boxStyle(el),
        background: fillColor(el.fill, el.fillAlpha),
        borderRadius: el.preset === 'ellipse' ? '50%' : undefined,
      }}
    />
  )
}

function RunView({ run }: { run: Run }) {
  if (run.br) return <br />
  const style: CSSProperties = {
    fontWeight: run.b ? 700 : undefined,
    fontStyle: run.i ? 'italic' : undefined,
    textDecoration: run.u ? 'underline' : undefined,
    color: run.color,
    fontSize: run.sz ? ptToCqw(run.sz) : undefined,
    fontFamily: run.font ? `${FONT_VAR[run.font] ?? `'${run.font}'`}, sans-serif` : undefined,
  }
  const content = run.t ?? ''
  if (run.href) {
    return (
      <a href={run.href} target="_blank" rel="noreferrer" style={style}>
        {content}
      </a>
    )
  }
  return <span style={style}>{content}</span>
}

function TextView({ el }: { el: TextEl }) {
  const justify =
    el.anchor === 'ctr' ? 'center' : el.anchor === 'b' ? 'flex-end' : 'flex-start'
  return (
    <div
      className="deck-text"
      style={{
        ...boxStyle(el),
        background: fillColor(el.fill, el.fillAlpha),
        borderRadius: el.preset === 'ellipse' ? '50%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        paddingLeft: pctW(el.insets.l),
        paddingRight: pctW(el.insets.r),
        paddingTop: pctH(el.insets.t),
        paddingBottom: pctH(el.insets.b),
      }}
    >
      {el.paras.map((para, index) => (
        <p
          key={index}
          style={{
            margin: 0,
            lineHeight: 1.2,
            textAlign: para.align ? ALIGN[para.align] : undefined,
            fontSize: para.defaultSz ? ptToCqw(para.defaultSz) : undefined,
          }}
        >
          {para.bullet ? <span>{`${para.bullet}  `}</span> : null}
          {para.runs.map((run, runIndex) => (
            <RunView key={runIndex} run={run} />
          ))}
        </p>
      ))}
    </div>
  )
}

function SlideView({ slide }: { slide: Slide }) {
  const background: CSSProperties =
    slide.bg && slide.bg.type === 'color' ? { background: slide.bg.color } : {}
  return (
    <div className="deck-slide" style={background}>
      {slide.bg?.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.bg.src}
          alt=""
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}
        />
      ) : null}
      {slide.elements.map((el, index) => {
        if (el.kind === 'image') return <ImageView key={index} el={el} />
        if (el.kind === 'shape') return <ShapeView key={index} el={el} />
        return <TextView key={index} el={el} />
      })}
    </div>
  )
}

/**
 * Share link for this deck on Google Slides. The deck must be shared publicly
 * ("Anyone with the link - Viewer") for the embed to render. Leave empty to use
 * the built-in render only.
 */
const DECK_SHARE_URL =
  'https://docs.google.com/presentation/d/1-bPcgJ6zdBBVPUg3OpN7u_5VdpyQ3xz-DcOmR7YXq6I/edit?usp=sharing'

function DeckSlides() {
  return (
    <div className="flex flex-col gap-8">
      {deck.slides.map((slide) => (
        <section key={slide.index}>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--t-muted)]">
            <span className="rounded-full border border-[var(--t-border)] px-2.5 py-0.5">
              Slide {slide.index}
            </span>
            <span>of {deck.slides.length}</span>
          </div>
          <SlideView slide={slide} />
        </section>
      ))}
    </div>
  )
}

export default function SlidePage() {
  return (
    <main
      className={`${montserrat.variable} ${roboto.variable} mx-auto w-full max-w-[1280px] px-3 pb-24 pt-6 lg:px-4 lg:pb-16`}
    >
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-[var(--t-muted)] uppercase">
          BCH BLAZE 2026
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Toops — Project Deck</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
          The full presentation, rendered slide by slide.
        </p>
      </header>

      <DeckView shareUrl={DECK_SHARE_URL} slides={<DeckSlides />} />
    </main>
  )
}
