import { describe, it, expect } from 'vitest';
import { buildPrompt, extractPromptVersion, getPromptVersion } from './prompt';
import { classifyEmail, classifyEmailWithMeta } from './classify';
import { TONE } from './schema';

describe('extractPromptVersion', () => {
  it('extracts a semver version from a heading', () => {
    expect(extractPromptVersion('# Some Prompt — v1.0.0\n\nBody')).toBe('1.0.0');
  });

  it('returns null when no version marker is present', () => {
    expect(extractPromptVersion('# Some Prompt\n\nBody')).toBeNull();
  });
});

describe('getPromptVersion', () => {
  it('reads the version from the ES classification prompt', async () => {
    expect(await getPromptVersion('es')).toBe('1.0.0');
  });

  it('reads the version from the EN classification prompt', async () => {
    expect(await getPromptVersion('en')).toBe('1.0.0');
  });
});

describe('buildPrompt', () => {
  it('loads the Spanish template by default and substitutes placeholders', async () => {
    const out = await buildPrompt({
      subject: 'Test subject',
      body: 'Test body line',
      from: 'user@example.com',
    });

    expect(out).toContain('user@example.com');
    expect(out).toContain('Test subject');
    expect(out).toContain('Test body line');
    expect(out).not.toMatch(/\{\{from\}\}/);
    expect(out).not.toMatch(/\{\{subject\}\}/);
    expect(out).not.toMatch(/\{\{body\}\}/);
    expect(out).toContain('Instrucciones de clasificación');
  });

  it('loads the English template when lang=en', async () => {
    const out = await buildPrompt(
      { subject: 'Subject', body: 'Body', from: 'a@b.com' },
      'en',
    );
    expect(out).toContain('Classification instructions');
    expect(out).not.toContain('Instrucciones de clasificación');
  });

  it('ES prompt contains all canonical tone values used as emotion signal', async () => {
    const out = await buildPrompt(
      { subject: 'Test', body: 'Test', from: 'a@b.com' },
      'es',
    );
    for (const tone of TONE) {
      expect(out).toContain(tone);
    }
  });

  it('EN prompt contains all canonical tone values used as emotion signal', async () => {
    const out = await buildPrompt(
      { subject: 'Test', body: 'Test', from: 'a@b.com' },
      'en',
    );
    for (const tone of TONE) {
      expect(out).toContain(tone);
    }
  });
});

const skipLlm = process.env['SKIP_LLM_INTEGRATION'] === '1';

describe.skipIf(skipLlm)('classifyEmail with real prompt', () => {
  it('should classify P1 production error correctly', async () => {
    const result = await classifyEmail({
      subject: 'URGENTE: Error 500 en producción',
      body: 'El sistema de pagos está caído. Clientes no pueden comprar. Perdiendo ventas.',
      from: 'cto@acme.com',
    });

    expect(result.priority).toBe('P1');
    expect(result.type).toBe('support');
    expect(result.category).toBe('technical');
    expect(result.tone).toMatch(/aggressive|frustrated/);
    expect(result.urgency).toBe('high');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should classify lead inquiry correctly', async () => {
    const result = await classifyEmail({
      subject: 'Consulta de pricing',
      body: 'Hola, estoy interesado en su producto. ¿Cuánto cuesta el plan empresarial?',
      from: 'prospecto@startup.com',
    });

    expect(result.type).toBe('prospect');
    expect(result.category).toBe('not_applicable');
    expect(result.tone).toBe('neutral');
  });

  it('should classify newsletter as spam', async () => {
    const result = await classifyEmail({
      subject: 'Weekly Newsletter - Best Deals!',
      body: "Check out this week's promotions...",
      from: 'newsletter@marketing.com',
    });

    expect(result.type).toBe('spam');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('should handle low confidence ambiguous cases', async () => {
    const result = await classifyEmail({
      subject: 'Question',
      body: 'Hi',
      from: 'user@example.com',
    });

    expect(result.confidence).toBeLessThan(0.7);
  });

  it('always returns tone within canonical set and confidence in [0,1]', async () => {
    const result = await classifyEmail({
      subject: 'No puedo iniciar sesión',
      body: 'Llevo dos horas intentando entrar y no puedo. Es muy frustrante.',
      from: 'user@client.com',
    });

    expect(TONE).toContain(result.tone);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('produces identical canonical enum values in ES and EN prompts', async () => {
    const es = await classifyEmail(
      {
        subject: 'URGENTE: sistema caído',
        body: 'Nada funciona, estamos perdiendo dinero en producción.',
        from: 'cto@acme.com',
      },
      { lang: 'es' },
    );
    const en = await classifyEmail(
      {
        subject: 'URGENT: system down',
        body: 'Nothing works, we are losing money in production.',
        from: 'cto@acme.com',
      },
      { lang: 'en' },
    );
    expect(es.priority).toBe(en.priority);
    expect(es.type).toBe(en.type);
    expect(es.urgency).toBe(en.urgency);
  });

  it('classifyEmailWithMeta returns result, meta (rawText/model/usage), prompt and promptVersion', async () => {
    const { result, meta, prompt, promptVersion } = await classifyEmailWithMeta({
      subject: 'No puedo iniciar sesión',
      body: 'Llevo dos horas intentando entrar y no puedo. Es muy frustrante.',
      from: 'user@client.com',
    });

    expect(TONE).toContain(result.tone);
    expect(typeof meta.rawText).toBe('string');
    expect(typeof meta.model).toBe('string');
    expect(meta.usage).toHaveProperty('promptTokens');
    expect(meta.usage).toHaveProperty('completionTokens');
    expect(prompt).toContain('user@client.com');
    expect(promptVersion).toBe('1.0.0');
  });
});
