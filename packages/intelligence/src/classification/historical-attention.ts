import type { PromptLang } from './prompt';

export const HISTORICAL_ATTENTION_VERSION = '1.0.2';

export const MESSAGE_PRIORITY_CRITERIA = {
  P1: 'This message reports or escalates a new failure in what the company delivers — something lost, damaged, missing, not performed or wrongly closed — or demands compensation for one.',
  P2: 'Needs handling on a case already under way, with no new failure reported: asking for the status of or a reply to an earlier claim, coordinating a pickup, appointment or document, confirming a step, or an operational complaint without a concrete failure.',
  P3: 'Nothing for the company to fix: information, notices, confirmations or acceptances, introductions, job applications or simple routine requests.',
} as const;

export const HISTORICAL_URGENCY_CRITERIA = {
  high: 'At the time of this message, evidence establishes an immediate deadline, an operation or person still blocked, an ongoing loss, or consequences that worsen while waiting. A pending claim or missing compensation alone does not establish time pressure.',
  medium: 'An action remains pending and needs attention soon, but available evidence supports scheduling it without an active blockage, growing loss or immediate deadline. A historical incident alone does not establish current time pressure.',
  low: 'Sources establish no time pressure: an informational exchange, future planning or routine coordination. Missing timing evidence is unknown, not proof of low urgency; record urgency_evidence as unknown.',
} as const;

const spanish = {
  priority: {
    P1: 'Este mensaje informa o escala una falla nueva en lo que entrega la empresa: pérdida, daño, faltante, incumplimiento o cierre incorrecto; o solicita compensación por esa falla.',
    P2: 'Requiere atender un caso en curso sin informar una falla nueva: pedir estado o respuesta a un reclamo anterior, coordinar una recogida, cita o documento, confirmar un paso o comunicar una queja operativa sin una falla concreta.',
    P3: 'No hay una falla que la empresa deba corregir: información, avisos, confirmaciones, aceptaciones, presentaciones, postulaciones o solicitudes simples de rutina.',
  },
  urgency: {
    high: 'En la fecha del mensaje existe evidencia de un plazo inmediato, una persona u operación aún bloqueada, una pérdida en curso o consecuencias que empeoran al esperar. Un reclamo pendiente o una compensación sin pagar, por sí solos, no demuestran presión de tiempo.',
    medium: 'Queda una acción pendiente que requiere atención pronto, pero la evidencia permite programarla sin bloqueo activo, pérdida creciente ni plazo inmediato. Un incidente histórico, por sí solo, no demuestra presión de tiempo actual.',
    low: 'Las fuentes establecen ausencia de presión de tiempo: intercambio informativo, planificación futura o coordinación rutinaria. Si falta evidencia temporal, registra urgency_evidence como unknown; esa ausencia no demuestra urgencia baja.',
  },
};

/** Both native and language backfill classifiers use these same decision boundaries. */
export function renderHistoricalAttention(template: string, lang: PromptLang) {
  if (lang !== 'en' && lang !== 'es') throw new Error('Historical attention language unavailable');
  const rubric = lang === 'es' ? spanish : { priority: MESSAGE_PRIORITY_CRITERIA, urgency: HISTORICAL_URGENCY_CRITERIA };
  let output = template;
  for (const [field, criteria] of Object.entries(rubric)) {
    const section = new RegExp(`(## \\d+\\. ${field}\\r?\\n)[\\s\\S]*?(?=\\r?\\n## |$)`);
    if (!section.test(output)) throw new Error('Historical attention section missing');
    output = output.replace(section, (_whole, heading: string) => `${heading}\n${Object.entries(criteria).map(([value, criterion]) => `- **${value}**: ${criterion}`).join('\n')}\n`);
  }
  const upwardRule = lang === 'es' ? '- Si tienes dudas sobre la prioridad, es mejor subir (P2 → P1) que bajar'
    : '- If in doubt about priority, err upward (P2 → P1), not downward';
  if (!output.includes(upwardRule)) throw new Error('Historical uncertainty rule missing');
  output = output.replace(upwardRule, lang === 'es'
    ? '- La incertidumbre exige señalar la evidencia faltante; no eleves prioridad ni urgencia solo por dudar. Evalúa cada eje de forma independiente.'
    : '- Uncertainty requires recording missing evidence; do not raise priority or urgency solely because of doubt. Judge the two axes independently.');
  return output;
}
