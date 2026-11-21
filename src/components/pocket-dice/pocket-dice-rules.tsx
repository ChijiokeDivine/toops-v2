// src/components/pocket-dice/pocket-dice-rules.tsx
const RULES = [
  '2-10 players lock the same stake and each pick a total from 2 to 12.',
  'Picks stay hidden until the room closes, then the two dice roll once.',
  'An exact pick splits the whole pot. If nobody is exact, the two closest picks share it (the nearer pick gets more).',
  'No fee. The pot is always paid out in full.',
]

export function PocketDiceRules() {
  return (
    <details id="rules" className="dual-card group/section mt-4 bg-[#050910] p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">How Pocket Dice works</h2>
        <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
          ＋
        </span>
      </summary>

      <ol className="mt-3 space-y-2">
        {RULES.map((rule, index) => (
          <li key={rule} className="flex gap-2.5 text-[12px] leading-relaxed text-[var(--t-muted)]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/70">
              {index + 1}
            </span>
            {rule}
          </li>
        ))}
      </ol>
    </details>
  )
}
