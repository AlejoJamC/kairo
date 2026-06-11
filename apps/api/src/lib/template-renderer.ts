/**
 * Template renderer — KAI-115 / ADR-023 §4
 *
 * Handles server-side merge-field resolution, HTML sanitization, signature
 * injection, and HTML email wrapping.  Pure logic (no supabase/inngest
 * imports) — fully unit-testable.
 *
 * Merge variable vocabulary:
 *   {{cliente.nombre}}  → conversation.customer_display_name (or empty string)
 *   {{cliente.email}}   → ticket.from_email
 *   {{ticket.id}}       → human ticket id (KAI-T-<ticket_number>)
 *   {{ticket.asunto}}   → ticket.subject
 *   {{agente.email}}    → sending mailbox address (gmailFromEmail)
 *   {{agente.nombre}}   → same as agente.email until display names are stored
 *   {{firma}}           → account.signature_plain (for plain bodies)
 */

// ---------------------------------------------------------------------------
// Variable resolution
// ---------------------------------------------------------------------------

export interface TemplateVars {
  "cliente.nombre": string;
  "cliente.email": string;
  "ticket.id": string;
  "ticket.asunto": string;
  "agente.email": string;
  "agente.nombre": string;
  /** Plain-text signature — automatically appended; also injectable via {{firma}} */
  firma: string;
}

/**
 * Replace all `{{key}}` placeholders (case-insensitive) with the corresponding
 * value.  Unknown placeholders are left as-is (visible to agent, harmless).
 */
export function resolveTemplateVars(content: string, vars: Partial<TemplateVars>): string {
  return content.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim().toLowerCase() as keyof TemplateVars;
    return Object.prototype.hasOwnProperty.call(vars, k) ? (vars[k] ?? "") : match;
  });
}

// ---------------------------------------------------------------------------
// HTML sanitization (allow-list, no external deps)
// ---------------------------------------------------------------------------

/** Tags allowed in HTML email content. */
const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span",
  "b", "strong", "i", "em", "u", "s",
  "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "img",
]);

/** Attributes allowed per tag (applied globally for simplicity). */
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "style", "class", "width", "height", "target", "rel"]);

/**
 * Minimal allow-list HTML sanitizer.
 * Strips dangerous tags (script, iframe, object, embed, form, etc.) and
 * removes event-handler attributes (on*).
 *
 * Not a full parser — relies on regex for simplicity; sufficient for
 * agent-authored email bodies where the threat model is accidental injection
 * rather than adversarial XSS (templates are created by trusted account owners).
 */
export function sanitizeHtml(html: string): string {
  // 1. Remove entire dangerous tag blocks (including content)
  let safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<link\b[^>]*/gi, "");

  // 2. Strip attributes that aren't in the allow-list (incl. all on* handlers)
  safe = safe.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) return "";
    // Filter attributes
    const cleanAttrs = attrs.replace(/\s([a-zA-Z-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/g, (attrMatch, attrName: string) => {
      const lowerAttr = attrName.toLowerCase();
      if (lowerAttr.startsWith("on")) return ""; // strip all event handlers
      if (!ALLOWED_ATTRS.has(lowerAttr)) return "";
      return attrMatch;
    });
    return `<${lowerTag}${cleanAttrs}>`;
  });

  // 3. Remove closing tags for disallowed elements
  safe = safe.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (_match, tag: string) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : "";
  });

  return safe;
}

// ---------------------------------------------------------------------------
// Plain-text body builder
// ---------------------------------------------------------------------------

export interface BuildPlainBodyOpts {
  /** Agent-authored body (may contain {{...}} already resolved). */
  body: string;
  /** [KAIRO-xxx] token to inject into footer (from ticket traceability). */
  kairoToken: string;
  /** Optional account signature (plain text). */
  signaturePlain?: string | null;
}

/**
 * Assembles the final plain-text body:
 *   <body>
 *   <blank line>
 *   --
 *   <signature if present>
 *   Ref: [KAIRO-xxx]
 */
export function buildPlainBody(opts: BuildPlainBodyOpts): string {
  const parts: string[] = [opts.body, ""];
  const footerLines: string[] = ["--"];
  if (opts.signaturePlain) footerLines.push(opts.signaturePlain);
  footerLines.push(`Ref: ${opts.kairoToken}`);
  parts.push(...footerLines);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// HTML email wrapper
// ---------------------------------------------------------------------------

export interface BuildHtmlBodyOpts {
  /** Plain-text body (already resolved) — converted to <p> paragraphs if bodyHtml not given. */
  bodyPlain: string;
  /** Optional HTML content (already sanitized). */
  bodyHtml?: string | null;
  /** [KAIRO-xxx] token. */
  kairoToken: string;
  /** Account brand color (hex, e.g. '#5c6bc0'). */
  brandColor?: string | null;
  /** Account name for branding header. */
  accountName?: string | null;
  /** Optional HTML signature. */
  signatureHtml?: string | null;
  /** Optional plain signature (fallback when signatureHtml is absent). */
  signaturePlain?: string | null;
}

/** Escape plain text so it can be embedded safely in HTML. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert plain-text paragraphs (double-newline separated) to <p> tags. */
export function plainToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px 0">${escHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Builds a full HTML email (inline-CSS, email-client compatible) with:
 * - Brand-colored header bar
 * - Message body (HTML or derived from plain)
 * - Signature block
 * - Ref footer with [KAIRO-xxx] token (hidden via small muted text)
 */
export function buildHtmlBody(opts: BuildHtmlBodyOpts): string {
  const color = opts.brandColor ?? "#5c6bc0";
  const accountName = opts.accountName ? escHtml(opts.accountName) : "Kairo";

  const contentHtml = opts.bodyHtml
    ? sanitizeHtml(opts.bodyHtml)
    : plainToHtmlParagraphs(opts.bodyPlain);

  const signatureBlock = opts.signatureHtml
    ? sanitizeHtml(opts.signatureHtml)
    : opts.signaturePlain
      ? `<p style="margin:0;color:#6b7280;font-size:13px;white-space:pre-line">${escHtml(opts.signaturePlain)}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb">
    <tr><td align="center" style="padding:24px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

        <!-- Brand header -->
        <tr><td style="background:${color};padding:16px 24px">
          <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:0.02em">${accountName}</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px;color:#111827;font-size:15px;line-height:1.6">
          ${contentHtml}
        </td></tr>

        ${signatureBlock ? `
        <!-- Signature -->
        <tr><td style="padding:0 24px 20px;border-top:1px solid #f3f4f6">
          <div style="padding-top:16px">${signatureBlock}</div>
        </td></tr>` : ""}

        <!-- Traceability footer -->
        <tr><td style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6">
          <span style="font-size:11px;color:#9ca3af">${escHtml(opts.kairoToken)}</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
