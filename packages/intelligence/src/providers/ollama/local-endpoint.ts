import { ProviderError } from '../base';

export function localOllamaEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ProviderError('Invalid local Ollama endpoint', false); }
  const host = url.hostname;
  const ipv4 = host.split('.').map(Number);
  const privateIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && (ipv4[0] === 127 || ipv4[0] === 10 || (ipv4[0] === 192 && ipv4[1] === 168)
      || (ipv4[0] === 172 && ipv4[1]! >= 16 && ipv4[1]! <= 31));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || !(host === 'localhost' || host === '[::1]' || privateIpv4)) {
    throw new ProviderError('Ollama requires a loopback or private LAN endpoint; remote models must use AI Gateway', false);
  }
  return url.toString().replace(/\/$/, '');
}
