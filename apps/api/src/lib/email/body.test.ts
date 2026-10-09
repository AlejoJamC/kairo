import { expect, it } from 'bun:test';
import { extractBody } from './body';

const encoded = (value: string) => Buffer.from(value).toString('base64url');

it('reads nested MIME content rather than substituting the Gmail snippet', () => {
  const body = extractBody({ mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', body: { data: encoded('Acme account access needs restoration.') } },
      { mimeType: 'text/html', body: { data: encoded('<p>Acme account access needs restoration.</p>') } },
    ] },
    { mimeType: 'text/plain', filename: 'synthetic-attachment.txt', body: { data: encoded('Attachment text must not become message content.') } },
  ] });
  expect(body.body_plain).toBe('Acme account access needs restoration.');
  expect(body.body_html).toContain('<p>');
});

it('provides readable HTML fallback without embedded script or style content', () => {
  const body = extractBody({ mimeType: 'text/html', body: { data: encoded('<style>ignored</style><script>ignored</script><p>Acme &amp; support<br>needs access</p>') } });
  expect(body.body_plain.trim()).toBe('Acme & support\nneeds access');
});
