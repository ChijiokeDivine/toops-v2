// Synthesised sound effects (Web Audio) - no audio files needed.
// Browsers block audio until the first click/key press, so the demo starts silent and
// sound switches on as soon as the visitor interacts with the page.

const KEY = 'toops-roulette-muted'
const VOLUME = 0.5

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let loaded = false

function ready(): AudioContext | null {
  if (muted || !ctx || !master || ctx.state !== 'running') return null
  return ctx
}

export function unlock() {
  if (typeof window === 'undefined') return
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : VOLUME
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

export function isMuted() {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    try {
      muted = window.localStorage.getItem(KEY) === '1'
    } catch {}
  }
  return muted
}

export function setMuted(next: boolean) {
  muted = next
  loaded = true
  try {
    window.localStorage.setItem(KEY, next ? '1' : '0')
  } catch {}
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : VOLUME, ctx.currentTime, 0.02)
  if (!next) unlock()
}

interface ToneOpts {
  freq: number
  end?: number
  dur: number
  type?: OscillatorType
  vol?: number
  at?: number
  dest?: AudioNode
}

function tone(c: AudioContext, { freq, end, dur, type = 'sine', vol = 0.15, at = 0, dest }: ToneOpts) {
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (end) osc.frequency.exponentialRampToValueAtTime(end, t + dur)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain)
  gain.connect(dest ?? master!)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

/** countdown beep (last 3 seconds) */
export function beep() {
  const c = ready()
  if (c) tone(c, { freq: 880, dur: 0.09, vol: 0.14 })
}

/** your own bet */
export function chip() {
  const c = ready()
  if (!c) return
  tone(c, { freq: 1400, dur: 0.05, type: 'triangle', vol: 0.12 })
  tone(c, { freq: 1900, dur: 0.07, type: 'triangle', vol: 0.12, at: 0.05 })
}

/** another player's bet (quiet) */
export function blip() {
  const c = ready()
  if (c) tone(c, { freq: 700, end: 900, dur: 0.05, type: 'triangle', vol: 0.045 })
}

/** whoosh + one tick per tile passing the marker, slowing down with the strip. Returns a stop function. */
export function spin(count: number, ms: number): () => void {
  const c = ready()
  if (!c || !master) return () => {}
  const bus = c.createGain()
  bus.connect(master)
  tone(c, { freq: 220, end: 880, dur: 0.4, vol: 0.1, dest: bus })
  const total = ms / 1000
  for (let i = 1; i <= count; i++) {
    const at = total * (1 - Math.pow(1 - i / count, 1 / 3)) // mirrors the ease-out of the strip
    tone(c, { freq: 850 + Math.random() * 120, end: 480, dur: 0.035, type: 'triangle', vol: 0.08, at, dest: bus })
  }
  return () => {
    bus.gain.cancelScheduledValues(c.currentTime)
    bus.gain.setTargetAtTime(0, c.currentTime, 0.02)
  }
}

const ARPEGGIO = [523, 659, 784, 1047]

/** result: 'win' / 'lose' for the player, null when they had no bet */
export function result(outcome: 'red' | 'black' | 'green', mine: 'win' | 'lose' | null) {
  const c = ready()
  if (!c) return
  if (mine === 'lose') {
    tone(c, { freq: 300, end: 140, dur: 0.4, vol: 0.14 })
    return
  }
  if (mine === 'win' || outcome === 'green') {
    const notes = outcome === 'green' ? [...ARPEGGIO, 1319, 1568] : ARPEGGIO
    notes.forEach((f, i) => tone(c, { freq: f, dur: 0.22, type: 'triangle', vol: 0.16, at: i * 0.09 }))
    return
  }
  tone(c, { freq: 660, dur: 0.18, vol: 0.12 })
  tone(c, { freq: 880, dur: 0.24, vol: 0.12, at: 0.1 })
}
