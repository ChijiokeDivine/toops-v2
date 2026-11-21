// src/components/pocket-dice/die.tsx
import type { Ref } from 'react'

/** Pip cells on a 3×3 grid, as `[row, column]`. */
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [1, 3],
    [2, 1],
    [2, 3],
    [3, 1],
    [3, 3],
  ],
}

const FACES = [1, 2, 3, 4, 5, 6] as const

type DieProps = {
  wrapperRef: Ref<HTMLDivElement>
  cubeRef: Ref<HTMLDivElement>
  className?: string
}

/**
 * A six-faced CSS cube. The stage positions the wrapper and drives the cube's
 * transform every frame (see roll-choreography.ts), so this component never
 * re-renders while a roll plays. Opposite faces add up to seven.
 */
export function Die({ wrapperRef, cubeRef, className = '' }: DieProps) {
  return (
    <div ref={wrapperRef} className={`pd-die ${className}`} aria-hidden="true">
      <div ref={cubeRef} className="pd-cube">
        <span className="pd-core pd-core-a" />
        <span className="pd-core pd-core-b" />
        <span className="pd-core pd-core-c" />
        {FACES.map((value) => (
          <span key={value} className={`pd-face pd-f${value}`}>
            {PIPS[value]?.map(([row, column]) => (
              <i
                key={`${row}-${column}`}
                className="pd-pip"
                style={{ gridRow: row, gridColumn: column }}
              />
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
