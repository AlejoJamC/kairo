import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Field, FieldSelect, FieldTextarea } from './field'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { px } from './lib/units'

// Escalate tab of the context panel: the signals that justify escalating the
// ticket and the form to do it. A read-only ticket shows no form.

type SignalTone = 'P1' | 'P2' | 'P3' | 'overdue' | 'atRisk' | 'escalating' | 'onTime' | 'frustrated' | 'ok' | 'warn' | 'bad' | 'none'

const DOT: Record<SignalTone, string> = {
  P1: tokens['priority.P1'],
  P2: tokens['priority.P2'],
  P3: tokens['priority.P3'],
  overdue: tokens['sla.overdueBar'],
  atRisk: tokens['sla.atRisk'],
  escalating: tokens['sla.escalation'],
  onTime: tokens['sla.onTime'],
  frustrated: tokens['sentiment.frustrated'],
  ok: tokens['color.ok'],
  warn: tokens['color.warn'],
  bad: tokens['color.bad'],
  none: tokens['border.strong'],
}

type EscalateSignal = { id: string; label: string; value: string; tone: SignalTone }

type EscalateForm = {
  /** People who can receive escalations; without it the "Escalate to" field is not shown. */
  targets?: readonly { value: string; label: string }[]
  target?: string
  onTarget?: (value: string) => void
  reason: string
  onReason: (value: string) => void
  onSubmit: () => void
  submitting?: boolean
  /** The escalation failed: callout above the button. */
  error?: string
  /** Nobody can receive escalations: the select and the button are disabled. */
  unavailable?: boolean
}

type EscalatePanelProps = {
  summary: { headline: string; explanation: string }
  signals: readonly EscalateSignal[]
  /** The form; omitted for a read-only ticket. */
  form?: EscalateForm
  /** The ticket is already escalated: this text replaces the form. */
  escalatedText?: string
  labels: {
    to: string
    reason: string
    reasonPlaceholder: string
    /** "Escalate KAI-106". */
    submit: string
    /** "Alerts the on-call senior by SMS." or the unavailable note. */
    note: string
    nobody: string
    /** "Escalate to" select: id of the select for focus from the E shortcut. */
    toId?: string
  }
}

function EscalatePanel({ summary, signals, form, escalatedText, labels }: EscalatePanelProps) {
  return (
    <Box role="tabpanel" display="flex" flexDirection="column" gap={14} padding={18}>
      <Box display="flex" flexDirection="column" gap={4} padding={12} borderRadius={px(tokens['radius.row'])} backgroundColor={tokens['notes.background']} boxShadow={`inset 0 0 0 1px ${tokens['notes.border']}`}>
        <Text fontSize={12.5} fontWeight={600} color={tokens['notes.label']}>
          {summary.headline}
        </Text>
        <Text fontSize={12} lineHeightRatio={1.5} color={tokens['text.secondary']}>
          {summary.explanation}
        </Text>
      </Box>
      <Box tag="ul" margin={0} padding={0} listStyle="none" overflowX="hidden" overflowY="hidden" borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} borderRadius={px(tokens['radius.input'])}>
        {signals.map((signal, index) => (
          <Box
            key={signal.id}
            tag="li"
            display="flex"
            alignItems="center"
            gap={10}
            paddingVertical={9}
            paddingHorizontal={12}
            borderBottomWidth={index === signals.length - 1 ? 0 : 1}
            borderStyle="solid"
            borderBottomColor={tokens['border.default']}
          >
            <Box width={7} height={7} circle flexShrink={0} backgroundColor={DOT[signal.tone]} aria-hidden />
            <Text flexGrow={1} fontSize={12.5} color={tokens['text.secondary']}>
              {signal.label}
            </Text>
            <Text font="mono" fontSize={11.5} color={tokens['text.primary']}>
              {signal.value}
            </Text>
          </Box>
        ))}
      </Box>

      {form && !escalatedText && (
        <>
          {form.targets && (
            <Field label={labels.to}>
              <FieldSelect value={form.target} onValueChange={form.onTarget} disabled={form.unavailable} id={labels.toId}>
                {form.unavailable ? (
                  <option value="">{labels.nobody}</option>
                ) : (
                  form.targets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))
                )}
              </FieldSelect>
            </Field>
          )}
          <Field label={labels.reason}>
            <FieldTextarea rows={3} value={form.reason} placeholder={labels.reasonPlaceholder} onChangeText={form.onReason} />
          </Field>
          {form.error && <Callout tone="error">{form.error}</Callout>}
          <Button
            size="lg"
            full
            icon={<Icon name="escalate" size={13} color={tokens['status.escalated']} />}
            disabled={form.unavailable}
            loading={form.submitting}
            onPress={form.onSubmit}
          >
            {labels.submit}
          </Button>
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {labels.note}
          </Text>
        </>
      )}
      {escalatedText && (
        <Box display="flex" alignItems="center" gap={8} paddingVertical={10} paddingHorizontal={12} borderRadius={px(tokens['radius.row'])} borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']}>
          <Icon name="escalate" size={13} color={tokens['status.escalated']} />
          <Text fontSize={12.5} color={tokens['text.secondary']}>
            {escalatedText}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export { EscalatePanel }
export type { EscalateForm, EscalatePanelProps, EscalateSignal, SignalTone }
