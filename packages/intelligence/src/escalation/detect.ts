import type { EscalationContext, EscalationDetectionResult, EscalationReason } from './types.js';

const LABELS: Record<string, Pick<EscalationReason, 'label_es' | 'label_en' | 'severity'>> = {
  sla_breach_risk:  { label_es: 'Riesgo de incumplimiento SLA',      label_en: 'SLA breach risk',          severity: 'high'   },
  enterprise_client:{ label_es: 'Impacto SLA cliente Enterprise',    label_en: 'Enterprise SLA impact',    severity: 'high'   },
  high_frustration: { label_es: 'Alta frustración — cliente recurrente', label_en: 'High frustration — recurrent client', severity: 'medium' },
  repeated_error:   { label_es: 'Error técnico repetido',             label_en: 'Repeated technical error', severity: 'medium' },
  past_l2_case:     { label_es: 'Caso similar escalado a L2',         label_en: 'Similar past L2 case',     severity: 'high'   },
};

function minutesUntilSla(slaDueAt: string): number {
  return (new Date(slaDueAt).getTime() - Date.now()) / 60_000;
}

function minutesSinceCreation(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 60_000;
}

function deriveLevel(reasons: EscalationReason[]): 1 | 2 | 3 {
  const highs   = reasons.filter((r) => r.severity === 'high').length;
  const mediums = reasons.filter((r) => r.severity === 'medium').length;
  if (highs >= 2 || (highs >= 1 && mediums >= 1)) return 3;
  if (highs === 1 || mediums >= 2)                 return 2;
  if (mediums === 1 || reasons.length > 0)         return 1;
  return 1;
}

function deriveConfidence(reasons: EscalationReason[]): number {
  if (reasons.length === 0) return 0;
  const weights = { high: 1.0, medium: 0.6, low: 0.3 };
  const raw = reasons.reduce((sum, r) => sum + weights[r.severity], 0);
  return Math.min(parseFloat((raw / (reasons.length * 1.0 + 1)).toFixed(2)), 1);
}

export function detectEscalationTriggers(ctx: EscalationContext): EscalationDetectionResult {
  const active: EscalationReason[] = [];

  const trigger = (id: keyof typeof LABELS) =>
    active.push({ id: id as EscalationReason['id'], ...LABELS[id] });

  // sla_breach_risk: SLA due within 60 minutes and ticket not resolved
  if (
    ctx.slaDueAt &&
    ctx.status !== 'resolved' &&
    ctx.status !== 'closed' &&
    minutesUntilSla(ctx.slaDueAt) <= 60
  ) {
    trigger('sla_breach_risk');
  }

  // enterprise_client: planScore >= 0.8 and open > 2 hours
  if (
    ctx.planScore >= 0.8 &&
    ctx.status !== 'resolved' &&
    ctx.status !== 'closed' &&
    minutesSinceCreation(ctx.createdAt) > 120
  ) {
    trigger('enterprise_client');
  }

  // high_frustration: emotion frustrated + 3rd+ ticket in last 30 days
  if (ctx.emotion === 'frustrated' && ctx.ticketsLast30Days >= 3) {
    trigger('high_frustration');
  }

  // repeated_error: 2+ technical tickets from same client in last 7 days
  if (ctx.technicalLast7Days >= 2) {
    trigger('repeated_error');
  }

  // past_l2_case: resolved by pgvector + escalations cross-join in API layer
  if (ctx.pastL2CaseFound) {
    trigger('past_l2_case');
  }

  return {
    reasons:          active,
    recommendedLevel: deriveLevel(active),
    confidence:       deriveConfidence(active),
  };
}
