import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
import { classifyEmail } from './classify';

describe('buildPrompt', () => {
  it('loads template from file and substitutes placeholders', async () => {
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
    expect(out).toContain('Email Classification Prompt');
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

    expect(result.prioridad).toBe('P1');
    expect(result.tipo).toBe('support');
    expect(result.categoria).toBe('technical');
    expect(result.sentimiento).toBe('urgente');
    expect(result.confianza).toBeGreaterThan(0.8);
  });

  it('should classify lead inquiry correctly', async () => {
    const result = await classifyEmail({
      subject: 'Consulta de pricing',
      body: 'Hola, estoy interesado en su producto. ¿Cuánto cuesta el plan empresarial?',
      from: 'prospecto@startup.com',
    });

    expect(result.tipo).toBe('lead');
    expect(result.categoria).toBe('sales');
    expect(result.sentimiento).toBe('neutral');
  });

  it('should classify newsletter as spam', async () => {
    const result = await classifyEmail({
      subject: 'Weekly Newsletter - Best Deals!',
      body: "Check out this week's promotions...",
      from: 'newsletter@marketing.com',
    });

    expect(result.tipo).toBe('spam');
    expect(result.confianza).toBeGreaterThan(0.9);
  });

  it('should handle low confidence ambiguous cases', async () => {
    const result = await classifyEmail({
      subject: 'Question',
      body: 'Hi',
      from: 'user@example.com',
    });

    expect(result.confianza).toBeLessThan(0.7);
  });
});
