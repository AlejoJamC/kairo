import { ARTWORK_COLORS, BODY, BODY_ASPECT, BODY_VIEWBOX, FIVE_LAYER_MIN_HEIGHT, SILHOUETTE } from './lib/brand-artwork'
import { Path, Svg } from './lib/svg'

// The Kairo symbol: five flat layers, one per letter of KAIRO, stacked in a
// fixed order. Below 32px tall the three-layer cut (O, K, A) takes over.

type KairoMarkLayers = 'auto' | 3 | 5

type KairoMarkProps = {
  /** Height in px; the width follows the artwork (1.124 × the height). */
  size?: number
  /** `auto` picks five layers from 32px tall and the three-layer cut below. */
  layers?: KairoMarkLayers
  /** Draws the symbol as one silhouette in this color (for example `currentColor`). */
  ink?: string
  /** Makes the symbol meaningful: role="img" with this accessible name. */
  label?: string
}

/** How many layers the symbol draws at a given height. */
function kairoMarkLayers(size: number, layers: KairoMarkLayers = 'auto'): 3 | 5 {
  if (layers !== 'auto') return layers
  return size >= FIVE_LAYER_MIN_HEIGHT ? 5 : 3
}

function KairoMark({ size = 32, layers = 'auto', ink, label }: KairoMarkProps) {
  const full = kairoMarkLayers(size, layers) === 5
  const accessibility = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)

  return (
    <Svg width={size * BODY_ASPECT} height={size} viewBox={BODY_VIEWBOX} {...accessibility}>
      {ink ? (
        <Path d={SILHOUETTE.body} fill={ink} />
      ) : (
        <>
          {full && <Path d={BODY.i} fill={ARTWORK_COLORS.yellowLight} />}
          <Path d={BODY.o} fill={ARTWORK_COLORS.violet} />
          <Path d={BODY.k} fill={ARTWORK_COLORS.orange} />
          <Path d={BODY.a} fill={ARTWORK_COLORS.yellow} />
          {full && <Path d={BODY.r} fill={ARTWORK_COLORS.violetLight} />}
        </>
      )}
    </Svg>
  )
}

export { KairoMark, kairoMarkLayers }
export type { KairoMarkProps, KairoMarkLayers }
