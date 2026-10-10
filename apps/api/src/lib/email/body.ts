export interface GmailBodyPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailBodyPart[];
}

/** Shared MIME reader used by polling and onboarding. */
export function extractBody(payload: GmailBodyPart | undefined): { body_plain: string; body_html: string } {
  const plain: string[] = [];
  const html: string[] = [];
  function walk(part: GmailBodyPart): void {
    if (part.filename) return;
    if (part.body?.data) {
      const text = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      if (part.mimeType === 'text/plain') plain.push(text);
      if (part.mimeType === 'text/html') html.push(text);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  if (payload) walk(payload);
  const body_html = html.join('\n');
  const body_plain = plain.join('\n') || body_html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return { body_plain, body_html };
}
