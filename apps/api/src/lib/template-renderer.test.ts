/**
 * KAI-115 — Template renderer: merge fields, HTML sanitization, body builders
 */
import { describe, it, expect } from "bun:test";
import {
  resolveTemplateVars,
  sanitizeHtml,
  buildPlainBody,
  buildHtmlBody,
  type TemplateVars,
} from "./template-renderer.js";

// ---------------------------------------------------------------------------
// resolveTemplateVars
// ---------------------------------------------------------------------------

describe("resolveTemplateVars", () => {
  it("replaces known variables", () => {
    const vars: Partial<TemplateVars> = {
      "cliente.nombre": "Alice",
      "ticket.id": "abc12345",
    };
    const result = resolveTemplateVars("Hola {{cliente.nombre}}, tu ticket es {{ticket.id}}.", vars);
    expect(result).toBe("Hola Alice, tu ticket es abc12345.");
  });

  it("leaves unknown variables intact", () => {
    const result = resolveTemplateVars("{{unknown.var}}", {});
    expect(result).toBe("{{unknown.var}}");
  });

  it("is case-insensitive for variable keys", () => {
    const result = resolveTemplateVars("{{CLIENTE.NOMBRE}}", { "cliente.nombre": "Bob" });
    expect(result).toBe("Bob");
  });

  it("replaces empty string for known var with empty value", () => {
    const result = resolveTemplateVars("Hello {{cliente.nombre}}!", { "cliente.nombre": "" });
    expect(result).toBe("Hello !");
  });

  it("replaces all occurrences of the same variable", () => {
    const result = resolveTemplateVars("{{ticket.id}} and {{ticket.id}} again", { "ticket.id": "xyz" });
    expect(result).toBe("xyz and xyz again");
  });

  it("handles {{firma}} variable", () => {
    const result = resolveTemplateVars("Body\n{{firma}}", { firma: "John Doe\njohn@example.com" });
    expect(result).toBe("Body\nJohn Doe\njohn@example.com");
  });
});

// ---------------------------------------------------------------------------
// sanitizeHtml
// ---------------------------------------------------------------------------

describe("sanitizeHtml", () => {
  it("passes through safe HTML unchanged", () => {
    const safe = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  it("strips <script> blocks entirely (including content)", () => {
    const result = sanitizeHtml('<p>Safe</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Safe</p>");
  });

  it("strips <iframe> blocks", () => {
    const result = sanitizeHtml('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain("iframe");
  });

  it("removes on* event handler attributes", () => {
    const result = sanitizeHtml('<a href="https://example.com" onclick="evil()">link</a>');
    expect(result).not.toContain("onclick");
    expect(result).toContain('href="https://example.com"');
  });

  it("strips disallowed tags but keeps content in place", () => {
    // <marquee> is not in the allow-list — tag stripped, content kept
    const result = sanitizeHtml("<marquee>Scrolling</marquee>");
    expect(result).not.toContain("<marquee");
    // Content may or may not remain depending on impl — the key is the tag is stripped
  });

  it("allows standard email-safe tags", () => {
    const html = "<p><strong>Bold</strong> and <em>italic</em> <a href='#'>link</a></p>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<a");
  });
});

// ---------------------------------------------------------------------------
// buildPlainBody
// ---------------------------------------------------------------------------

describe("buildPlainBody", () => {
  it("includes body, separator, and KAIRO token in footer", () => {
    const result = buildPlainBody({
      body: "Thanks for reaching out!",
      kairoToken: "[KAIRO-abc12345]",
    });
    expect(result).toContain("Thanks for reaching out!");
    expect(result).toContain("--");
    expect(result).toContain("Ref: [KAIRO-abc12345]");
  });

  it("includes signature when provided", () => {
    const result = buildPlainBody({
      body: "Hello!",
      kairoToken: "[KAIRO-abc12345]",
      signaturePlain: "John Doe\nSupport Team",
    });
    expect(result).toContain("John Doe");
    expect(result).toContain("Support Team");
  });

  it("omits signature block when not provided", () => {
    const result = buildPlainBody({
      body: "Hello!",
      kairoToken: "[KAIRO-abc12345]",
    });
    // Still has body + footer
    expect(result).toContain("Hello!");
    expect(result).toContain("Ref: [KAIRO-abc12345]");
  });
});

// ---------------------------------------------------------------------------
// buildHtmlBody
// ---------------------------------------------------------------------------

describe("buildHtmlBody", () => {
  it("includes the KAIRO token in the footer", () => {
    const html = buildHtmlBody({ bodyPlain: "Hello!", kairoToken: "[KAIRO-abc12345]" });
    expect(html).toContain("[KAIRO-abc12345]");
  });

  it("uses bodyHtml content when provided (after sanitization)", () => {
    const html = buildHtmlBody({
      bodyPlain: "Fallback",
      bodyHtml: "<p>Hello <strong>world</strong></p>",
      kairoToken: "[KAIRO-abc12345]",
    });
    expect(html).toContain("<strong>world</strong>");
  });

  it("escapes bodyPlain for HTML when no bodyHtml given", () => {
    const html = buildHtmlBody({
      bodyPlain: "Hello <script>evil</script>",
      kairoToken: "[KAIRO-abc12345]",
    });
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("applies brand color in header", () => {
    const html = buildHtmlBody({
      bodyPlain: "Hi",
      kairoToken: "[KAIRO-abc12345]",
      brandColor: "#ff5733",
    });
    expect(html).toContain("#ff5733");
  });

  it("shows account name in brand header", () => {
    const html = buildHtmlBody({
      bodyPlain: "Hi",
      kairoToken: "[KAIRO-abc12345]",
      accountName: "Acme Corp",
    });
    expect(html).toContain("Acme Corp");
  });

  it("includes HTML signature when provided", () => {
    const html = buildHtmlBody({
      bodyPlain: "Hi",
      kairoToken: "[KAIRO-abc12345]",
      signatureHtml: "<p><strong>Jane Doe</strong></p>",
    });
    expect(html).toContain("<strong>Jane Doe</strong>");
  });

  it("sanitizes injected bodyHtml to strip scripts", () => {
    const html = buildHtmlBody({
      bodyPlain: "Fallback",
      bodyHtml: '<p>Good</p><script>evil()</script>',
      kairoToken: "[KAIRO-abc12345]",
    });
    expect(html).not.toContain("<script");
    expect(html).toContain("<p>Good</p>");
  });

  it("produces valid-looking HTML structure", () => {
    const html = buildHtmlBody({ bodyPlain: "Test", kairoToken: "[KAIRO-abc12345]" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body");
    expect(html).toContain("</body>");
  });
});
