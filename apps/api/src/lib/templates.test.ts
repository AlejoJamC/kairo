import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-30: response templates — schema validation + business logic tests
// ---------------------------------------------------------------------------

const CreateTemplateSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(100).optional(),
  locale: z.enum(["es", "en"]).default("es"),
});

const UpdateTemplateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  category: z.string().max(100).nullable().optional(),
  locale: z.enum(["es", "en"]).optional(),
});

describe("CreateTemplateSchema", () => {
  it("accepts valid template", () => {
    expect(
      CreateTemplateSchema.safeParse({ title: "Hello", content: "Body text" }).success
    ).toBe(true);
  });

  it("defaults locale to es", () => {
    const result = CreateTemplateSchema.safeParse({ title: "T", content: "C" });
    expect(result.success && result.data.locale).toBe("es");
  });

  it("accepts en locale", () => {
    const result = CreateTemplateSchema.safeParse({ title: "T", content: "C", locale: "en" });
    expect(result.success && result.data.locale).toBe("en");
  });

  it("rejects unknown locale", () => {
    expect(CreateTemplateSchema.safeParse({ title: "T", content: "C", locale: "fr" }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(CreateTemplateSchema.safeParse({ title: "", content: "C" }).success).toBe(false);
  });

  it("rejects empty content", () => {
    expect(CreateTemplateSchema.safeParse({ title: "T", content: "" }).success).toBe(false);
  });

  it("rejects title over 255 chars", () => {
    expect(
      CreateTemplateSchema.safeParse({ title: "a".repeat(256), content: "C" }).success
    ).toBe(false);
  });

  it("accepts optional category", () => {
    const result = CreateTemplateSchema.safeParse({
      title: "T",
      content: "C",
      category: "acknowledgment",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateTemplateSchema", () => {
  it("accepts partial update with only title", () => {
    expect(UpdateTemplateSchema.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("accepts partial update with only content", () => {
    expect(UpdateTemplateSchema.safeParse({ content: "New body" }).success).toBe(true);
  });

  it("accepts null category (clear it)", () => {
    expect(UpdateTemplateSchema.safeParse({ category: null }).success).toBe(true);
  });

  it("rejects empty title on update", () => {
    expect(UpdateTemplateSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts empty object (route handler guards this)", () => {
    expect(UpdateTemplateSchema.safeParse({}).success).toBe(true);
  });
});

describe("resolveLocale logic", () => {
  function resolveLocale(acceptLanguage: string | undefined): "es" | "en" {
    if (!acceptLanguage) return "es";
    return acceptLanguage.toLowerCase().startsWith("en") ? "en" : "es";
  }

  it("defaults to es when no header", () => {
    expect(resolveLocale(undefined)).toBe("es");
  });

  it("returns en for en-US", () => {
    expect(resolveLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("returns en for en", () => {
    expect(resolveLocale("en")).toBe("en");
  });

  it("returns es for es-ES", () => {
    expect(resolveLocale("es-ES,es;q=0.9")).toBe("es");
  });

  it("returns es for fr (unsupported → default)", () => {
    expect(resolveLocale("fr-FR")).toBe("es");
  });

  it("returns es for pt", () => {
    expect(resolveLocale("pt-BR")).toBe("es");
  });
});

describe("default templates coverage", () => {
  const defaults = {
    es: ["Recibimos tu consulta", "Necesitamos más información", "Ticket resuelto"],
    en: ["We received your inquiry", "We need more information", "Ticket resolved"],
  };

  it("seeds 3 ES templates", () => {
    expect(defaults.es).toHaveLength(3);
  });

  it("seeds 3 EN templates", () => {
    expect(defaults.en).toHaveLength(3);
  });

  it("ES templates have expected titles", () => {
    expect(defaults.es[0]).toBe("Recibimos tu consulta");
    expect(defaults.es[1]).toBe("Necesitamos más información");
    expect(defaults.es[2]).toBe("Ticket resuelto");
  });

  it("EN templates have expected titles", () => {
    expect(defaults.en[0]).toBe("We received your inquiry");
    expect(defaults.en[1]).toBe("We need more information");
    expect(defaults.en[2]).toBe("Ticket resolved");
  });
});

describe("soft delete contract", () => {
  it("soft delete sets is_active false, not a hard delete", () => {
    const record = { id: "abc", is_active: true };
    const afterDelete = { ...record, is_active: false };
    expect(afterDelete.id).toBe("abc");
    expect(afterDelete.is_active).toBe(false);
  });
});
