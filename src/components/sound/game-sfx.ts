// Synthesised game sound kit (Web Audio). No asset files, no network requests.
// Audio is created on the first user gesture and respects the global sound setting.

import { getSoundMuted } from '@/components/settings/sound-preference'

export type GameSound =
  | 'click'
  | 'chip'
  | 'join'
  | 'leave'
  | 'start'
  | 'tick'
  | 'turn'
  | 'safe'
  | 'bomb'
  | 'shield'
  | 'win'
  | 'lose'
  | 'void'
  | 'shake'
  | 'toss'
  | 'bounce'
  | 'land'

type ToneOptions = {
  end?: number
  dur?: number
  type?: OscillatorType
  vol?: number
  at?: number
}

type NoiseOptions = {
  dur?: number
  vol?: number
  at?: number
  type?: BiquadFilterType
  freq?: number
  endFreq?: number
}

let ctx: AudioContext | null = null
let master: GainNode | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return null

  if (!ctx) {
    ctx = new AudioCtor()
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 24
    compressor.ratio.value = 8
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(compressor).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

export function unlockGameAudio() {
  ensureContext()
}

if (typeof window !== 'undefined') {
  const unlock = () => ensureContext()
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
}

function tone(c: AudioContext, frequency: number, options: ToneOptions = {}) {
  if (!master) return
  const { end, dur = 0.12, type = 'sine', vol = 0.12, at = 0 } = options
  const start = c.currentTime + 0.006 + at
  const stop = start + dur
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  if (end != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), stop)
  }
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, stop)
  osc.connect(gain).connect(master)
  osc.start(start)
  osc.stop(stop + 0.02)
}

function noise(c: AudioContext, options: NoiseOptions = {}) {
  if (!master) return
  const { dur = 0.2, vol = 0.08, at = 0, type = 'lowpass', freq = 1200, endFreq } = options
  const start = c.currentTime + 0.006 + at
  const length = Math.max(1, Math.floor(c.sampleRate * dur))
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
  }
  const source = c.createBufferSource()
  source.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, start)
  if (endFreq != null) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + dur)
  }
  const gain = c.createGain()
  gain.gain.setValueAtTime(Math.max(0.0002, vol), start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  source.connect(filter).connect(gain).connect(master)
  source.start(start)
}

function rattle(c: AudioContext, duration: number) {
  const steps = Math.floor(duration / 105)
  for (let i = 0; i < steps; i++) {
    const at = i * 0.105
    const taper = 0.4 + 0.6 * Math.sin((Math.PI * (i + 0.5)) / steps)
    noise(c, {
      dur: 0.045,
      vol: 0.05 * taper,
      at,
      type: 'bandpass',
      freq: 1600 + Math.random() * 1400,
    })
    if (i % 2 === 0) {
      tone(c, 240 + Math.random() * 120, {
        end: 160,
        dur: 0.045,
        type: 'square',
        vol: 0.025 * taper,
        at,
      })
    }
  }
}

const SCALE_WIN = [523.25, 659.25, 783.99, 1046.5]
const SCALE_LOSE = [392, 329.63, 261.63]

export function playGameSound(sound: GameSound, options: { volume?: number } = {}) {
  if (getSoundMuted()) return
  const c = ensureContext()
  if (!c || !master) return
  const scale = options.volume ?? 1

  switch (sound) {
    case 'click':
      tone(c, 660, { end: 480, dur: 0.05, type: 'square', vol: 0.035 * scale })
      break
    case 'chip':
      tone(c, 1480, { dur: 0.05, type: 'triangle', vol: 0.09 * scale })
      tone(c, 1980, { dur: 0.07, type: 'triangle', vol: 0.08 * scale, at: 0.05 })
      break
    case 'join':
      tone(c, 392, { end: 587.33, dur: 0.16, type: 'sine', vol: 0.09 * scale })
      tone(c, 783.99, { dur: 0.18, type: 'triangle', vol: 0.06 * scale, at: 0.1 })
      break
    case 'leave':
      tone(c, 440, { end: 220, dur: 0.2, type: 'triangle', vol: 0.07 * scale })
      break
    case 'start':
      noise(c, { dur: 0.34, vol: 0.05 * scale, freq: 700, endFreq: 2600, type: 'bandpass' })
      tone(c, 180, { end: 720, dur: 0.34, type: 'sawtooth', vol: 0.03 * scale })
      break
    case 'tick':
      tone(c, 1120, { dur: 0.035, type: 'square', vol: 0.03 * scale })
      noise(c, { dur: 0.025, vol: 0.03 * scale, type: 'highpass', freq: 4000 })
      break
    case 'turn':
      tone(c, 880, { dur: 0.13, type: 'triangle', vol: 0.08 * scale })
      tone(c, 1174.66, { dur: 0.16, type: 'triangle', vol: 0.07 * scale, at: 0.09 })
      tone(c, 1760, { dur: 0.22, type: 'sine', vol: 0.035 * scale, at: 0.18 })
      break
    case 'safe':
      [1046.5, 1318.51, 1567.98].forEach((frequency, index) => {
        tone(c, frequency, {
          dur: 0.14,
          type: 'triangle',
          vol: 0.075 * scale,
          at: index * 0.055,
        })
      })
      tone(c, 2093, { dur: 0.26, type: 'sine', vol: 0.03 * scale, at: 0.1 })
      break
    case 'bomb':
      noise(c, { dur: 0.6, vol: 0.22 * scale, freq: 620, endFreq: 60 })
      tone(c, 120, { end: 32, dur: 0.55, type: 'sawtooth', vol: 0.16 * scale })
      tone(c, 70, { end: 30, dur: 0.5, type: 'sine', vol: 0.18 * scale, at: 0.02 })
      break
    case 'shield':
      tone(c, 1567.98, { dur: 0.18, type: 'sine', vol: 0.07 * scale })
      tone(c, 2093, { dur: 0.22, type: 'triangle', vol: 0.05 * scale, at: 0.06 })
      noise(c, { dur: 0.28, vol: 0.04 * scale, type: 'highpass', freq: 3000, at: 0.02 })
      break
    case 'win':
      SCALE_WIN.forEach((frequency, index) => {
        tone(c, frequency, {
          dur: 0.24,
          type: 'triangle',
          vol: 0.09 * scale,
          at: index * 0.09,
        })
      })
      tone(c, 130.81, { dur: 0.5, type: 'sine', vol: 0.12 * scale })
      tone(c, 2093, { dur: 0.4, type: 'sine', vol: 0.03 * scale, at: 0.3 })
      break
    case 'lose':
      SCALE_LOSE.forEach((frequency, index) => {
        tone(c, frequency, {
          dur: 0.2 + index * 0.06,
          type: 'triangle',
          vol: 0.085 * scale,
          at: index * 0.12,
        })
      })
      tone(c, 98, { end: 65, dur: 0.45, type: 'sine', vol: 0.1 * scale })
      break
    case 'void':
      tone(c, 330, { end: 220, dur: 0.28, type: 'sine', vol: 0.06 * scale })
      tone(c, 220, { end: 165, dur: 0.32, type: 'triangle', vol: 0.05 * scale, at: 0.14 })
      break
    case 'shake':
      rattle(c, 1.2)
      break
    case 'toss':
      noise(c, { dur: 0.2, vol: 0.07 * scale, freq: 2400, endFreq: 700, type: 'bandpass' })
      tone(c, 320, { end: 720, dur: 0.16, type: 'triangle', vol: 0.035 * scale })
      break
    case 'bounce':
      noise(c, { dur: 0.06, vol: 0.09 * scale, type: 'highpass', freq: 2200 })
      tone(c, 190, { end: 80, dur: 0.09, type: 'sine', vol: 0.09 * scale })
      break
    case 'land':
      noise(c, { dur: 0.05, vol: 0.1 * scale, type: 'highpass', freq: 2600 })
      tone(c, 220, { end: 110, dur: 0.1, type: 'triangle', vol: 0.07 * scale })
      tone(c, 330, { end: 190, dur: 0.12, type: 'triangle', vol: 0.05 * scale, at: 0.045 })
      break
  }
}
