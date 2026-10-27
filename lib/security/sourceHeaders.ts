import { ImportError } from '@/lib/import/errors';
const blockedHeaders = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'cookie', 'set-cookie', 'user-agent', 'accept-encoding', 'upgrade', 'te', 'trailer', 'origin', 'referer', 'forwarded']);
export function sourceHeaders(headerName?: string, apiKey?: string): Record<string, string> {
  if (!headerName && !apiKey) return {};
  if (!headerName || !apiKey || !/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(headerName) || apiKey.length > 8192 || /[^\x20-\x7E]/.test(apiKey) || blockedHeaders.has(headerName.toLowerCase()) || /^(?:proxy-|sec-|x-forwarded-)/i.test(headerName)) throw new ImportError('Choose a valid API-key header and value. Routing, cookie and proxy headers cannot be overridden.');
  return { [headerName]: apiKey };
}
