import {
  ARTWORK_COLORS,
  BODY,
  BODY_ASPECT,
  BODY_VIEWBOX,
  FACES,
  LIMBS,
  LIMBS_ASPECT,
  LIMBS_VIEWBOX,
  POSES,
  SILHOUETTE,
} from './lib/brand-artwork'
import { Ellipse, G, Path, Svg } from './lib/svg'

// The Kairo character: the symbol with a face, and with limbs when it needs a
// gesture. The expression lives in the face; the body moves by shifting whole
// layers, never by deforming them.

type KairoExpression = 'happy' | 'neutral' | 'reading' | 'focused' | 'urgent' | 'decision' | 'paused'
type KairoPose = 'rest' | 'attentive' | 'thinking'

type Base = {
  /** Height in px; the width follows the artwork. */
  size?: number
  /** Makes the character meaningful: role="img" with this accessible name. */
  label?: string
}

type KairoCharacterProps =
  | (Base & { limbs?: false; ink?: undefined; expression?: KairoExpression; pose?: KairoPose })
  | (Base & { limbs: true; ink?: undefined; expression?: 'happy'; pose?: 'rest' })
  // One ink: a single silhouette in `ink`, the face cut out in `ground`.
  | (Base & { limbs?: boolean; ink: string; ground: string; expression?: 'happy'; pose?: 'rest' })

function KairoCharacter(props: KairoCharacterProps) {
  const { size = 64, label } = props
  const limbs = props.limbs === true
  const body = limbs ? LIMBS : BODY
  const accessibility = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)
  const frame = {
    width: size * (limbs ? LIMBS_ASPECT : BODY_ASPECT),
    height: size,
    viewBox: limbs ? LIMBS_VIEWBOX : BODY_VIEWBOX,
    ...accessibility,
  }

  if (props.ink !== undefined) {
    return (
      <Svg {...frame}>
        <Path d={limbs ? SILHOUETTE.limbs : SILHOUETTE.body} fill={props.ink} />
        <Path d={body.face} fill={props.ground} />
      </Svg>
    )
  }

  // The limbed character is drawn with the happy face and at rest only.
  const expression = limbs ? 'happy' : (props.expression ?? 'happy')
  const pose = POSES[limbs ? 'rest' : (props.pose ?? 'rest')]

  return (
    <Svg {...frame}>
      {limbs && <Path d={LIMBS.back} fill={ARTWORK_COLORS.yellow} />}
      <G transform={pose.i}>
        <Path d={body.i} fill={ARTWORK_COLORS.yellowLight} />
      </G>
      <Path d={body.o} fill={ARTWORK_COLORS.violet} />
      <Path d={body.k} fill={ARTWORK_COLORS.orange} transform={pose.k} />
      <Path d={body.a} fill={ARTWORK_COLORS.yellow} />
      <G transform={pose.r}>
        <Path d={body.r} fill={ARTWORK_COLORS.violetLight} />
      </G>
      <Face expression={expression} happy={body.face} />
    </Svg>
  )
}

function Face({ expression, happy }: { expression: KairoExpression; happy: string }) {
  if (expression === 'happy') return <Path d={happy} fill={ARTWORK_COLORS.face} />
  const face = FACES[expression]
  return (
    <G transform={face.transform} fill="none" stroke={ARTWORK_COLORS.face} strokeWidth={face.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {face.elements.map((element, index) =>
        element.shape === 'ellipse' ? (
          <Ellipse key={index} cx={element.cx} cy={element.cy} rx={element.rx} ry={element.ry} fill={ARTWORK_COLORS.face} stroke="none" />
        ) : (
          <Path key={index} d={element.d} />
        ),
      )}
    </G>
  )
}

export { KairoCharacter }
export type { KairoCharacterProps, KairoExpression, KairoPose }
