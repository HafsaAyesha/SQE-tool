import { lookup } from 'node:dns/promises';
import { connect as netConnect, isIP, type Socket } from 'node:net';
import { connect as tlsConnect, checkServerIdentity } from 'node:tls';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { Agent, ProxyAgent, request } from 'undici';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { ImportError } from '@/lib/import/errors';
import { sourceHeaders } from './sourceHeaders';
export { sourceHeaders } from './sourceHeaders';
import { MAX_DOCUMENT_BYTES } from '@/lib/import/limits';
export const SOURCE_USER_AGENT = 'CostLens/0.1';
export const URL_TIMEOUT_MS = 10000;
export type Address = { address: string; family: number };
export type PublicTarget = { url: URL; address: string; family: number };
export type Resolver = (hostname: string, signal: AbortSignal) => Promise<Address[]>;
export type RemoteResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array>; close: () => Promise<void> };
export type Transport = (target: PublicTarget, headers: Record<string, string>, signal: AbortSignal) => Promise<RemoteResponse>;
const urlSchema = z.string().trim().min(1).max(4096).url();
export function publicAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function parsePublicUrl(input: string) {
  const parsed = urlSchema.safeParse(input);
  if (!parsed.success) throw new ImportError('Enter a valid public HTTP or HTTPS URL.');
  const url = new URL(parsed.data);
  if (!['http:', 'https:'].includes(url.protocol)) throw new ImportError('Only HTTP and HTTPS links are supported.');
  if (url.username || url.password) throw new ImportError('Do not put credentials in the URL. Use the optional API-key fields.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname.includes('%') || (!isIP(hostname) && (!hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|onion)$/.test(hostname)))) throw new ImportError('URL not allowed. Only public internet addresses are allowed. Internal and metadata URLs are blocked.');
  if (isIP(hostname) && !publicAddress(hostname)) throw new ImportError('URL not allowed. Only public internet addresses are allowed. Private, loopback and metadata ranges are blocked.');
  url.hash = '';
  return { url, hostname };
}
const dnsSchema = z.object({ Status: z.number(), Answer: z.array(z.object({ type: z.number(), data: z.string() })).optional() });
function configuredProxy(protocol: string) {
  return protocol === 'https:' ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy : process.env.HTTP_PROXY || process.env.http_proxy;
}
/** Proxy-only cloud runtimes may not have native DNS. Resolve via a fixed trusted DoH endpoint. */
async function resolvePublicDns(hostname: string, signal: AbortSignal): Promise<Address[]> {
  const proxy = configuredProxy('https:');
  if (!proxy) return lookup(hostname, { all: true, verbatim: true });
  const agent = new ProxyAgent(proxy);
  try {
    const answers = await Promise.all([['A', 1, 4], ['AAAA', 28, 6]].map(async ([type, recordType, family]) => {
      const result = await request(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`, { dispatcher: agent, headers: { accept: 'application/dns-json', 'user-agent': SOURCE_USER_AGENT, 'accept-encoding': 'identity' }, signal });
      if (result.statusCode !== 200) { result.body.destroy(); throw new ImportError('Public DNS lookup is unavailable. Check the environment’s resolver network access.', 503); }
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of result.body) { size += chunk.length; if (size > 65536) { result.body.destroy(); throw new ImportError('The DNS response was invalid.', 502); } chunks.push(chunk); }
      const parsed = dnsSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!parsed.success || parsed.data.Status !== 0) throw new ImportError('This host could not be resolved to a public address.');
      return (parsed.data.Answer ?? []).filter(answer => answer.type === recordType).map(answer => ({ address: answer.data, family: Number(family) }));
    }));
    return answers.flat();
  } finally { await agent.destroy(); }
}
export async function validatePublicUrl(input: string, signal: AbortSignal, resolver: Resolver = resolvePublicDns): Promise<PublicTarget> {
  const { url, hostname } = parsePublicUrl(input);
  let addresses: Address[];
  try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname, signal); }
  catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('This host could not be resolved to a public address.'); }
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(answer => ![4, 6].includes(answer.family) || isIP(answer.address) !== answer.family || !publicAddress(answer.address))) throw new ImportError('URL not allowed. Only public internet addresses are allowed. This host resolves to a blocked address.');
  const address = addresses.find(answer => answer.family === 4) ?? addresses[0];
  return { url, address: address.address, family: address.family };
}
async function tcpSocket(target: PublicTarget, signal: AbortSignal): Promise<Socket> {
  const port = Number(target.url.port || (target.url.protocol === 'https:' ? 443 : 80));
  const proxyValue = configuredProxy(target.url.protocol);
  if (proxyValue) {
    const proxy = new URL(proxyValue);
    if (!['http:', 'https:'].includes(proxy.protocol)) throw new ImportError('The configured network proxy is unsupported.', 503);
    return new Promise((resolve, reject) => {
      const authority = `${target.family === 6 ? `[${target.address}]` : target.address}:${port}`;
      const headers: Record<string, string> = { host: authority, 'user-agent': SOURCE_USER_AGENT };
      if (proxy.username || proxy.password) headers['proxy-authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
      const connectRequest = (proxy.protocol === 'https:' ? httpsRequest : httpRequest)({ hostname: proxy.hostname, port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80), method: 'CONNECT', path: authority, headers, signal });
      connectRequest.once('connect', (response, socket, head) => {
        if (response.statusCode !== 200) { socket.destroy(); reject(new ImportError('The environment’s network policy blocked this source. Configure outbound access and retry.', 503)); return; }
        if (head.length) socket.unshift(head);
        const abort = () => socket.destroy(); signal.addEventListener('abort', abort, { once: true }); socket.once('close', () => signal.removeEventListener('abort', abort));
        resolve(socket);
      });
      connectRequest.once('error', () => reject(new ImportError('The source could not be reached through the network proxy.', 502)));
      connectRequest.end();
    });
  }
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: target.address, family: target.family, port, signal });
    socket.once('connect', () => resolve(socket)); socket.once('error', reject);
  });
}
/** Uses only the validated numeric IP for the socket. The hostname is retained for TLS and Host. */
const pinnedTransport: Transport = async (target, headers, signal) => {
  const hostname = target.url.hostname.replace(/^\[|\]$/g, '');
  const agent = new Agent({ connect: (_options, callback) => {
    void tcpSocket(target, signal).then(socket => {
      if (signal.aborted) { socket.destroy(); callback(new Error('aborted'), null); return; }
      if (target.url.protocol === 'http:') { callback(null, socket); return; }
      const secure = tlsConnect({ socket, host: hostname, servername: isIP(hostname) ? undefined : hostname, rejectUnauthorized: true, checkServerIdentity: (_name, certificate) => checkServerIdentity(hostname, certificate) });
      let connected = false;
      secure.once('secureConnect', () => { connected = true; callback(null, secure); }); secure.once('error', error => { if (!connected) callback(error, null); });
    }, error => callback(error, null));
  } });
  try {
    const result = await request(target.url, { dispatcher: agent, method: 'GET', signal, headers: { ...headers, 'user-agent': SOURCE_USER_AGENT, 'accept-encoding': 'identity', accept: 'application/json,text/csv,text/html;q=0.9,*/*;q=0.5' }, headersTimeout: URL_TIMEOUT_MS, bodyTimeout: URL_TIMEOUT_MS });
    return { status: result.statusCode, headers: result.headers, body: result.body, close: async () => { result.body.destroy(); await agent.destroy(); } };
  } catch (error) { await agent.destroy(); throw error; }
};
export type SafeFetchOptions = { headerName?: string; apiKey?: string; maxRedirects?: number; redirectHosts?: (hostname: string) => boolean };
export type FetchedSource = { bytes: Buffer; contentType: string };
export function createSafeFetcher(resolver: Resolver = resolvePublicDns, transport: Transport = pinnedTransport) {
  return async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<FetchedSource> {
    const authHeaders = sourceHeaders(options.headerName, options.apiKey);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ImportError('The source took longer than 10 seconds. Try a faster or smaller source.', 504)); }, URL_TIMEOUT_MS); });
    const operation = async () => {
      let current = input;
      for (let hop = 0; ; hop++) {
        const target = await validatePublicUrl(current, controller.signal, resolver);
        if (Object.keys(authHeaders).length && target.url.protocol !== 'https:') throw new ImportError('API-key authentication requires an HTTPS source.');
        const response = await transport(target, authHeaders, controller.signal);
        try {
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location;
            if (hop >= (options.maxRedirects ?? 0) || typeof location !== 'string') throw new ImportError('This source redirects. Use its final direct URL instead.');
            const next = new URL(location, target.url);
            if (Object.keys(authHeaders).length && next.origin !== target.url.origin) throw new ImportError('Authenticated redirects to another origin are not allowed.');
            if (target.url.protocol === 'https:' && next.protocol !== 'https:') throw new ImportError('Redirects from HTTPS to HTTP are not allowed.');
            if (options.redirectHosts && !options.redirectHosts(next.hostname)) throw new ImportError('This source redirected outside its supported hosts.');
            current = next.href; continue;
          }
          if (response.status < 200 || response.status >= 300) throw new ImportError(`The source could not be fetched (HTTP ${response.status}). Check sharing and access settings.`, 502);
          const declared = Number(response.headers['content-length']);
          if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) throw new ImportError('The source response exceeds the 10 MB limit.', 413);
          const chunks: Uint8Array[] = []; let size = 0;
          for await (const chunk of response.body) { controller.signal.throwIfAborted(); size += chunk.byteLength; if (size > MAX_DOCUMENT_BYTES) throw new ImportError('The source response exceeds the 10 MB limit.', 413); chunks.push(chunk); }
          let bytes = Buffer.concat(chunks);
          const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
          try {
            if (encoding === 'gzip') bytes = gunzipSync(bytes, { maxOutputLength: MAX_DOCUMENT_BYTES });
            else if (encoding === 'deflate') bytes = inflateSync(bytes, { maxOutputLength: MAX_DOCUMENT_BYTES });
            else if (encoding === 'br') bytes = brotliDecompressSync(bytes, { maxOutputLength: MAX_DOCUMENT_BYTES });
            else if (encoding !== 'identity') throw new ImportError('This source uses an unsupported response encoding.');
          } catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('The source response is damaged or expands beyond the 10 MB limit.', 413); }
          return { bytes, contentType: String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() };
        } finally { await response.close(); }
      }
    };
    try { return await Promise.race([operation(), timeout]); }
    catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('The source could not be fetched securely. Check the URL and try again.', 502); }
    finally { clearTimeout(timer!); controller.abort(); }
  };
}
export const safeFetch = createSafeFetcher();
