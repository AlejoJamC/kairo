import { tokens } from '@kairo/tokens'
import { Text } from './layout'
import { Circle, Path, Svg } from './lib/svg'

// The customer's sentiment as a small vector face, an emoji or the word.
// Every variant shares one accessible name, for example "Sentiment: frustrated".

type Sentiment = 'aggressive' | 'frustrated' | 'neutral' | 'positive'

const COLOR: Record<Sentiment, string> = {
  aggressive: tokens['sentiment.aggressive'],
  frustrated: tokens['sentiment.frustrated'],
  neutral: tokens['sentiment.neutral'],
  positive: tokens['sentiment.positive'],
}

const EMOJI: Record<Sentiment, string> = { aggressive: '😡', frustrated: '😠', neutral: '😐', positive: '🙂' }

const MOUTH: Record<Sentiment, string> = {
  aggressive: 'M5.4 11.2c.7-1.1 1.7-1.7 2.6-1.7s1.9.6 2.6 1.7',
  frustrated: 'M5.4 11.2c.7-1.1 1.7-1.7 2.6-1.7s1.9.6 2.6 1.7',
  neutral: 'M5.5 10.4h5',
  positive: 'M5.4 9.6c.7 1.1 1.7 1.7 2.6 1.7s1.9-.6 2.6-1.7',
}

type SentimentFaceProps = {
  /** null or undefined: nothing is rendered. */
  sentiment: Sentiment | null | undefined
  variant?: 'vector' | 'emoji' | 'text'
  /** Full accessible name, for example "Sentiment: frustrated". */
  label: string
  /** The word shown by the text variant. */
  word?: string
}

function SentimentFace({ sentiment, variant = 'vector', label, word }: SentimentFaceProps) {
  if (!sentiment) return null

  if (variant === 'text') {
    return (
      <Text fontSize={12} color={tokens['text.secondary']} title={label} aria-label={label}>
        {word ?? sentiment}
      </Text>
    )
  }

  if (variant === 'emoji') {
    return (
      <Text display="inline-flex" alignItems="center" justifyContent="center" width={14} height={14} fontSize={13} fontFamily={tokens['font.family.emoji'] as never} role="img" aria-label={label} title={label}>
        {EMOJI[sentiment]}
      </Text>
    )
  }

  const color = COLOR[sentiment]
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label} title={label}>
      <Circle cx={8} cy={8} r={6.3} />
      <Circle cx={5.8} cy={6.8} r={0.5} fill={color} />
      <Circle cx={10.2} cy={6.8} r={0.5} fill={color} />
      <Path d={MOUTH[sentiment]} />
      {sentiment === 'aggressive' && <Path d="M5 5.2l2 1M11 5.2l-2 1" />}
    </Svg>
  )
}

export { SentimentFace }
export type { SentimentFaceProps, Sentiment }
