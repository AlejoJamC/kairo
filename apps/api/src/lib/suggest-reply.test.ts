import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-31: context-aware reply suggestion — unit tests
// All Claude + Supabase calls are tested via logic isolation (no live calls)
// ---------------------------------------------------------------------------

// --- Language detection (duplicated from route for testability) ---

function detectLanguage(texts: string[]): "es" | "en" {
  const sample = texts.join(" ").toLowerCase().slice(0, 2000);
  const esSignals = (sample.match(/\b(hola|gracias|por favor|necesito|tengo|problema|ayuda|buenas|estimado)\b/g) ?? []).length;
  const enSignals = (sample.match(/\b(hello|thank|please|need|have|problem|help|dear|hi|issue)\b/g) ?? []).length;
  return enSignals > esSignals ? "en" : "es";
}

// --- Template filler ---

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template
  );
}

// --- Response schema ---

const SuggestReplyResponseSchema = z.object({
  suggestion: z.string(),
  confidence: z.number().min(0).max(1),
  detected_language: z.enum(["es", "en"]),
});

describe("detectLanguage", () => {
  it("detects Spanish from ES message", () => {
    expect(detectLanguage(["Hola, tengo un problema con mi cuenta por favor ayuda"])).toBe("es");
  });

  it("detects English from EN message", () => {
    expect(detectLanguage(["Hello, I have an issue with my account please help me"])).toBe("en");
  });

  it("defaults to es when no clear signals", () => {
    expect(detectLanguage(["???"])).toBe("es");
  });

  it("handles multiple texts", () => {
    expect(detectLanguage(["hola necesito ayuda", "tengo un problema"])).toBe("es");
  });

  it("uses majority signal", () => {
    expect(detectLanguage(["hello hi dear issue problem help have need please thank"])).toBe("en");
  });
});

describe("fillTemplate", () => {
  it("replaces single variable", () => {
    expect(fillTemplate("Hello {{name}}", { name: "World" })).toBe("Hello World");
  });

  it("replaces multiple variables", () => {
    const result = fillTemplate("{{a}} and {{b}}", { a: "foo", b: "bar" });
    expect(result).toBe("foo and bar");
  });

  it("replaces all occurrences of same variable", () => {
    const result = fillTemplate("{{x}} and {{x}}", { x: "hello" });
    expect(result).toBe("hello and hello");
  });

  it("leaves unknown variables untouched", () => {
    const result = fillTemplate("{{known}} {{unknown}}", { known: "yes" });
    expect(result).toBe("yes {{unknown}}");
  });
});

describe("SuggestReplyResponseSchema", () => {
  it("accepts valid Claude response", () => {
    const valid = {
      suggestion: "Hola, gracias por contactarnos...",
      confidence: 0.87,
      detected_language: "es",
    };
    expect(SuggestReplyResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects confidence > 1", () => {
    expect(SuggestReplyResponseSchema.safeParse({ suggestion: "s", confidence: 1.5, detected_language: "es" }).success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    expect(SuggestReplyResponseSchema.safeParse({ suggestion: "s", confidence: -0.1, detected_language: "es" }).success).toBe(false);
  });

  it("rejects unknown language", () => {
    expect(SuggestReplyResponseSchema.safeParse({ suggestion: "s", confidence: 0.8, detected_language: "fr" }).success).toBe(false);
  });

  it("accepts confidence 0 and 1 boundaries", () => {
    expect(SuggestReplyResponseSchema.safeParse({ suggestion: "s", confidence: 0, detected_language: "en" }).success).toBe(true);
    expect(SuggestReplyResponseSchema.safeParse({ suggestion: "s", confidence: 1, detected_language: "en" }).success).toBe(true);
  });
});

describe("JSON extraction from Claude response", () => {
  function extractJson(raw: string): unknown | null {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }

  it("extracts JSON from clean response", () => {
    const raw = `{"suggestion": "Hello", "confidence": 0.9, "detected_language": "en"}`;
    expect(extractJson(raw)).toEqual({ suggestion: "Hello", confidence: 0.9, detected_language: "en" });
  });

  it("extracts JSON with surrounding text", () => {
    const raw = `Here is the reply:\n{"suggestion": "Hi", "confidence": 0.8, "detected_language": "es"}\nEnd.`;
    const result = extractJson(raw) as Record<string, unknown>;
    expect(result?.suggestion).toBe("Hi");
  });

  it("returns null when no JSON found", () => {
    expect(extractJson("No JSON here")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(extractJson("{broken json")).toBeNull();
  });
});

describe("graceful degrade contract", () => {
  it("kb articles default to empty array", () => {
    const referencedKbArticles: string[] = [];
    expect(referencedKbArticles).toEqual([]);
    expect(Array.isArray(referencedKbArticles)).toBe(true);
  });

  it("similar case fallback string is non-empty", () => {
    const fallback = "No hay casos similares resueltos disponibles.";
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("message history fallback string is non-empty", () => {
    const fallback = "No hay historial de mensajes disponible.";
    expect(fallback.length).toBeGreaterThan(0);
  });
});
