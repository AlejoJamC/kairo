import { describe, it, expect } from 'bun:test';

import { DERIVATION_VERSION } from './derive';
import { generationResultMetadata, generationStartMetadata } from './telemetry';

describe('generationStartMetadata', () => {
  it('carries the rubric, the table and the language the generation runs with', () => {
    expect(
      generationStartMetadata({
        promptVersion: '1.5.1',
        lang: 'en',
        ensembleModel: null,
        ensembleMisconfigured: false,
        ticketId: 't1',
        accountId: 'a1',
      }),
    ).toEqual({
      promptVersion: '1.5.1',
      lang: 'en',
      derivationVersion: DERIVATION_VERSION,
      ensembleConfigured: false,
      ensembleMisconfigured: false,
      ticketId: 't1',
      accountId: 'a1',
    });
  });

  // A typo in INTELLIGENCE_ENSEMBLE turns the second model off with a warning
  // nobody reads. On the trace it is a field someone can filter on.
  it('marks an ensemble that was asked for and could not be parsed', () => {
    const meta = generationStartMetadata({
      promptVersion: null,
      lang: 'es',
      ensembleModel: null,
      ensembleMisconfigured: true,
    });

    expect(meta.ensembleConfigured).toBe(false);
    expect(meta.ensembleMisconfigured).toBe(true);
    expect(meta).not.toHaveProperty('promptVersion');
  });

  it('names the configured second model', () => {
    const meta = generationStartMetadata({
      promptVersion: '1.5.1',
      lang: 'es',
      ensembleModel: 'ollama:second',
      ensembleMisconfigured: false,
    });

    expect(meta.ensembleConfigured).toBe(true);
    expect(meta.ensembleConfiguredModel).toBe('ollama:second');
  });
});

describe('generationResultMetadata', () => {
  const verdict = { actionability: 'needs_action' as const, subject_matter: 'service' as const };

  it('carries the three coordinates and the type they derived', () => {
    expect(
      generationResultMetadata({
        provenance: 'external',
        factsPresent: true,
        verdict,
        type: 'support',
        ensemble: null,
        ensembleFailed: false,
        abstain: false,
      }),
    ).toEqual({
      provenance: 'external',
      factsPresent: true,
      actionability: 'needs_action',
      subjectMatter: 'service',
      type: 'support',
      ensembleFailed: false,
      abstain: false,
    });
  });

  it('keeps the second answer beside the first when the ensemble disagreed', () => {
    const meta = generationResultMetadata({
      provenance: 'same_company',
      factsPresent: true,
      verdict,
      type: 'support',
      ensemble: { model: 'second', type: 'internal' },
      ensembleFailed: false,
      abstain: true,
    });

    expect(meta.ensembleModel).toBe('second');
    expect(meta.ensembleType).toBe('internal');
    expect(meta.abstain).toBe(true);
  });

  // The provenance on a reclassified ticket is a fallback, not a reading of
  // the envelope; the trace has to say which one it is.
  it('says when provenance was assumed rather than read', () => {
    const meta = generationResultMetadata({
      provenance: 'external',
      factsPresent: false,
      verdict,
      type: 'support',
      ensemble: null,
      ensembleFailed: true,
      abstain: false,
    });

    expect(meta.factsPresent).toBe(false);
    expect(meta.ensembleFailed).toBe(true);
  });
});
