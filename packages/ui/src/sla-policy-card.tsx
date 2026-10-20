import { tokens } from '@kairo/tokens'
import { Card } from './card'
import { Field, FieldInput } from './field'
import { Box, Text } from './layout'
import { PriorityGlyph, type PriorityLevel } from './priority-glyph'
import { Skeleton } from './loading'
import { px } from './lib/units'

// The SLA policy of one priority in Settings › SLA by priority: the four
// thresholds as fields and the scale that shows them. The same segments and
// colors are the states of sla-indicator.

type SlaPolicyValues = { maximum: number; minimum: number; alert: number; escalation: number }
type SlaPolicyKey = keyof SlaPolicyValues

/** True when minimum < alert < escalation < maximum. */
function isSlaOrderValid(values: SlaPolicyValues): boolean {
  return values.minimum < values.alert && values.alert < values.escalation && values.escalation < values.maximum
}

/** "15 min", "1 h" or "1.5 h": hours when the value is a multiple of 60 or more. */
function formatSlaMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
}

type SlaScaleProps = {
  alert: number
  escalation: number
  maximum: number
  minimum?: number
  /** Legend texts, already formatted ("min 15 min"). */
  labels: { minimum: string; alert: string; escalation: string; breach: string }
}

function SlaScale({ alert, escalation, maximum, minimum, labels }: SlaScaleProps) {
  const total = Math.max(maximum, 1)
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / total) * 100))}%`
  return (
    <Box>
      <Box position="relative" display="flex" height={8} borderRadius={999} backgroundColor={tokens['sla.track']} overflowX="hidden" overflowY="hidden" aria-hidden>
        <Box width={pct(alert) as never} backgroundColor={tokens['sla.onTime']} />
        <Box width={pct(escalation - alert) as never} backgroundColor={tokens['sla.atRisk']} />
        <Box width={pct(maximum - escalation) as never} backgroundColor={tokens['sla.escalation']} />
        {minimum !== undefined && <Box position="absolute" top={0} bottom={0} width={2} left={pct(minimum) as never} backgroundColor={tokens['sla.minimumMarker']} />}
      </Box>
      <Box display="flex" flexWrap="wrap" gap={14} marginTop={6}>
        {[labels.minimum, labels.alert, labels.escalation, labels.breach].map((text, index) => (
          <Text key={index} font="mono" fontSize={11} color={[tokens['text.tertiary'], tokens['sla.alertLabel'], tokens['sla.escalationLabel'], tokens['sla.breachLabel']][index]}>
            {text}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

type SlaPolicyCardProps = {
  priority: PriorityLevel
  /** "P1 — Urgent". */
  title: string
  values: SlaPolicyValues
  onChange: (key: SlaPolicyKey, value: number) => void
  readOnly?: boolean
  loading?: boolean
  labels: {
    unit: string
    maximum: string
    minimum: string
    alert: string
    escalation: string
    /** Legend prefixes: "min", "alert", "escalation", "breach". */
    legend: { minimum: string; alert: string; escalation: string; breach: string }
    orderError: string
  }
}

const FIELDS: { key: SlaPolicyKey; color: string }[] = [
  { key: 'maximum', color: tokens['sla.overdueBar'] },
  { key: 'minimum', color: tokens['sla.minimumMarker'] },
  { key: 'alert', color: tokens['sla.atRisk'] },
  { key: 'escalation', color: tokens['sla.escalation'] },
]

function SlaPolicyCard({ priority, title, values, onChange, readOnly, loading, labels }: SlaPolicyCardProps) {
  const ordered = isSlaOrderValid(values)
  const wrong = (key: SlaPolicyKey): boolean => {
    if (ordered) return false
    if (key === 'minimum') return values.minimum >= values.alert
    if (key === 'alert') return values.alert <= values.minimum || values.alert >= values.escalation
    if (key === 'escalation') return values.escalation <= values.alert || values.escalation >= values.maximum
    return values.maximum <= values.escalation
  }
  return (
    <Card paddingVertical={18} paddingHorizontal={20} display="flex" flexDirection="column" gap={14}>
      <Box display="flex" flexWrap="wrap" alignItems="center" gap={8}>
        <PriorityGlyph priority={priority} size={14} label={false} />
        <Text fontSize={14} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        <Box flexGrow={1} />
        {!ordered && (
          <Text fontSize={12} color={tokens['color.bad-ink']} role="alert">
            {labels.orderError}
          </Text>
        )}
      </Box>
      <Box grid gridTemplateColumns="repeat(auto-fit, minmax(min(150px, 100%), 1fr))" gap={12}>
        {FIELDS.map(({ key, color }) => (
          <Box key={key} display="flex" flexDirection="column" justifyContent="flex-end" gap={6}>
            <Box display="flex" alignItems="flex-end" gap={6} height={30} aria-hidden>
              <Box width={7} height={7} marginBottom={4} borderRadius={2} flexShrink={0} backgroundColor={color} />
              <Text font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
                {labels[key]}
              </Text>
            </Box>
            {loading ? (
              <Skeleton height={px(tokens['size.field'])} />
            ) : (
              <Field label={labels[key]} hideLabel unit={labels.unit}>
                <FieldInput
                  inputMode="numeric"
                  value={String(values[key])}
                  readOnly={readOnly}
                  invalid={wrong(key) || undefined}
                  onChangeText={(text: string) => onChange(key, Number(text.replace(/\D/g, '')))}
                />
              </Field>
            )}
          </Box>
        ))}
      </Box>
      {!loading && (
        <SlaScale
          alert={values.alert}
          escalation={values.escalation}
          maximum={values.maximum}
          minimum={values.minimum}
          labels={{
            minimum: `${labels.legend.minimum} ${formatSlaMinutes(values.minimum)}`,
            alert: `${labels.legend.alert} ${formatSlaMinutes(values.alert)}`,
            escalation: `${labels.legend.escalation} ${formatSlaMinutes(values.escalation)}`,
            breach: `${labels.legend.breach} ${formatSlaMinutes(values.maximum)}`,
          }}
        />
      )}
    </Card>
  )
}

export { SlaPolicyCard, SlaScale, formatSlaMinutes, isSlaOrderValid }
export type { SlaPolicyCardProps, SlaPolicyKey, SlaPolicyValues, SlaScaleProps }
