// Session-trend sparkline: pure point math plus the one SVG it renders into.
// Extracted from the composition root (CONV-structure-3) — no state, no
// event wiring, fully unit-testable via `sparkPoints`.

const SPARK_WIDTH = 68
const SPARK_HEIGHT = 20
const SPARK_SAMPLES = 24
const FLAT_LINE = `0,${SPARK_HEIGHT / 2} ${SPARK_WIDTH},${SPARK_HEIGHT / 2}`

/**
 * Maps the most recent `SPARK_SAMPLES` USD samples onto a polyline `points`
 * string in a `0 0 68 20` viewBox. Fewer than two samples yields a flat
 * mid-height line rather than nothing, so the trend slot never collapses.
 */
export function sparkPoints(history: readonly number[]): string {
  let recent = history.slice(-SPARK_SAMPLES)
  if (recent.length < 2) return FLAT_LINE

  let min = Math.min(...recent)
  let max = Math.max(...recent)
  let span = max - min || 1

  return recent
    .map((value, index) => {
      let x = (index / (recent.length - 1)) * SPARK_WIDTH
      let y = SPARK_HEIGHT - 2 - ((value - min) / span) * (SPARK_HEIGHT - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function renderSparkline(points: string, color: string) {
  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ width: `${SPARK_WIDTH}px`, height: `${SPARK_HEIGHT}px`, display: 'block', overflow: 'visible' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        stroke-width="1.25"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  )
}
