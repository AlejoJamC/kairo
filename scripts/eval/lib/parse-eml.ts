export interface ParsedEmail {
  subject: string;
  from: string;
  body: string;
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r\n/g, '')
    .replace(/=\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function decodeRfc2047Word(encoded: string, encoding: string, charset: string): string {
  const enc = encoding.toUpperCase();
  let bytes: Uint8Array;

  if (enc === 'B') {
    const bin = atob(encoded);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    const qpDecoded = decodeQuotedPrintable(encoded.replace(/_/g, ' '));
    bytes = new Uint8Array(qpDecoded.length);
    for (let i = 0; i < qpDecoded.length; i++) bytes[i] = qpDecoded.charCodeAt(i);
  }

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeHeaderValue(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g,
    (_, charset: string, encoding: string, encoded: string) =>
      decodeRfc2047Word(encoded, encoding, charset)
  );
}

function parseHeaders(headerText: string): Map<string, string> {
  const headers = new Map<string, string>();
  // Unfold RFC 2822 folded headers
  const unfolded = headerText.replace(/\r?\n([ \t])/g, '$1');
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();
    if (!headers.has(name)) {
      headers.set(name, decodeHeaderValue(value));
    }
  }
  return headers;
}

function getBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decodeBody(raw: string, transferEncoding: string): string {
  const enc = transferEncoding.toLowerCase().trim();
  if (enc === 'base64') {
    const cleaned = raw.replace(/\s+/g, '');
    try {
      const bin = atob(cleaned);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return raw;
    }
  }
  if (enc === 'quoted-printable') {
    return decodeQuotedPrintable(raw);
  }
  return raw;
}

function extractPlainText(rawBody: string, contentType: string, transferEncoding: string): string | null {
  const ct = contentType.toLowerCase().split(';')[0]?.trim() ?? '';

  if (ct === 'text/plain') {
    return decodeBody(rawBody, transferEncoding);
  }

  if (ct.startsWith('multipart/')) {
    const boundary = getBoundary(contentType);
    if (!boundary) return null;
    return extractFromMultipart(rawBody, boundary);
  }

  return null;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFromMultipart(body: string, boundary: string): string | null {
  const delimiter = `--${escapeForRegex(boundary)}`;
  const parts = body.split(new RegExp(`${delimiter}(?:--|\\s*$)?`, 'm'));

  // Prefer text/plain; fall back to any extracted text from nested multipart
  let fallback: string | null = null;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === '--') continue;

    const nlnl = trimmed.search(/\r?\n\r?\n/);
    if (nlnl === -1) continue;

    const partHeaders = parseHeaders(trimmed.substring(0, nlnl));
    const partBody = trimmed.substring(nlnl).replace(/^\r?\n/, '');

    const partCt = partHeaders.get('content-type') ?? 'text/plain';
    const partCte = partHeaders.get('content-transfer-encoding') ?? '';
    const partCtBase = partCt.toLowerCase().split(';')[0]?.trim() ?? '';

    if (partCtBase === 'text/plain') {
      return decodeBody(partBody, partCte);
    }

    if (partCtBase.startsWith('multipart/')) {
      const nested = extractPlainText(partBody, partCt, partCte);
      if (nested !== null && fallback === null) fallback = nested;
    }
  }

  return fallback;
}

export function parseEml(content: string): ParsedEmail {
  // Detect line-ending style
  const hasCrLf = content.includes('\r\n');
  const sep = hasCrLf ? '\r\n\r\n' : '\n\n';
  const splitIdx = content.indexOf(sep);

  if (splitIdx === -1) {
    throw new Error('Invalid EML: no header/body separator found');
  }

  const headerText = content.substring(0, splitIdx);
  const rawBody = content.substring(splitIdx + sep.length);

  const headers = parseHeaders(headerText);

  const subject = headers.get('subject') ?? '';
  const from = headers.get('from') ?? '';
  const contentType = headers.get('content-type') ?? 'text/plain';
  const transferEncoding = headers.get('content-transfer-encoding') ?? '';

  const body = extractPlainText(rawBody, contentType, transferEncoding) ?? rawBody;

  return { subject, from, body: body.trim() };
}
