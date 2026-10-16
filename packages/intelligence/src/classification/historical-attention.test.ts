import { expect, test } from 'bun:test';
import { buildPrompt, getPromptVersion } from './prompt';
import { buildTicketVerdictQuestions, ticketQuestionsVersion, TICKET_QUESTIONS_VERSION } from './decision-questions';
import { MESSAGE_PRIORITY_CRITERIA, HISTORICAL_URGENCY_CRITERIA, HISTORICAL_ATTENTION_VERSION } from './historical-attention';

const message = { from: 'client@outside.com', subject: 'Account access', body: 'Access is restored. Please send the case number.' };

test('historical language and native questions share independent priority and urgency boundaries', async () => {
  const prompt = await buildPrompt({ ...message, stage: 'backfill' }, 'en');
  for (const criterion of Object.values(MESSAGE_PRIORITY_CRITERIA)) expect(prompt).toContain(criterion);
  for (const criterion of Object.values(HISTORICAL_URGENCY_CRITERIA)) expect(prompt).toContain(criterion);
  expect(prompt).not.toContain('err upward');
  expect(prompt).toContain('Judge the two axes independently');
  const questions = JSON.stringify(buildTicketVerdictQuestions('backfill'));
  expect(questions).toContain(HISTORICAL_URGENCY_CRITERIA.high);
  expect(questions).toContain(MESSAGE_PRIORITY_CRITERIA.P1);
  expect(await getPromptVersion('en', 'backfill')).toContain(`historical-attention:${HISTORICAL_ATTENTION_VERSION}`);
  expect(ticketQuestionsVersion('backfill')).toContain(`historical-attention:${HISTORICAL_ATTENTION_VERSION}`);
});

test('historical Spanish removes forced escalation without replacing missing evidence with low urgency', async () => {
  const prompt = await buildPrompt({ ...message, stage: 'backfill' }, 'es');
  expect(prompt).not.toContain('es mejor subir');
  expect(prompt).toContain('no demuestran presión de tiempo');
  expect(prompt).toContain('registra urgency_evidence como unknown');
  expect(prompt).toContain('Evalúa cada eje de forma independiente');
});

test('initial reading retains its existing questions, language rubric and versions', async () => {
  const prompt = await buildPrompt({ ...message, stage: 'onboarding' }, 'en');
  expect(prompt).toContain('err upward');
  expect(prompt).not.toContain(HISTORICAL_URGENCY_CRITERIA.high);
  expect(await getPromptVersion('en', 'onboarding')).not.toContain('historical-attention');
  expect(ticketQuestionsVersion('onboarding')).toBe(TICKET_QUESTIONS_VERSION);
  expect(ticketQuestionsVersion()).toBe(TICKET_QUESTIONS_VERSION);
});

test('historical classification retains the base tone section and native criteria', async () => {
  for (const lang of ['en', 'es'] as const) {
    const historical = await buildPrompt({ ...message, stage: 'backfill' }, lang);
    const initial = await buildPrompt({ ...message, stage: 'onboarding' }, lang);
    const section = (prompt: string) => prompt.split('## 5. tone\n')[1]?.split('## 6. urgency\n')[0];
    expect(section(historical)).toBeDefined();
    expect(section(historical)).toBe(section(initial));
  }
  expect(buildTicketVerdictQuestions('backfill')['tone']).toEqual(buildTicketVerdictQuestions('onboarding')['tone']);
});
