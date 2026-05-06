export const ESCALATION_TRIGGER_IDS = [
  'sla_breach_risk',
  'enterprise_client',
  'high_frustration',
  'repeated_error',
  'past_l2_case',
] as const;

export type EscalationTriggerId = (typeof ESCALATION_TRIGGER_IDS)[number];

export interface EscalationReason {
  id:        EscalationTriggerId;
  label_es:  string;
  label_en:  string;
  severity:  'high' | 'medium' | 'low';
}

export interface EscalationDetectionResult {
  reasons:           EscalationReason[];
  recommendedLevel:  1 | 2 | 3;
  confidence:        number;   // 0.0–1.0
}

export interface EscalationContext {
  ticketId:           string;
  emotion:            string | null;
  slaBreached:        boolean;
  slaDueAt:           string | null;
  createdAt:          string;
  status:             string;
  planScore:          number;
  ticketsLast30Days:  number;
  technicalLast7Days: number;  // same client, category=technical, proxy for repeated_error
  pastL2CaseFound:    boolean; // resolved from pgvector + escalations cross-join in API layer
}
