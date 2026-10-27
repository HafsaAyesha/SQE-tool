import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createSafeFetcher, parsePublicUrl, publicAddress, sourceHeaders, URL_TIMEOUT_MS, type Address, type RemoteResponse, type Transport } from '@/lib/security/urlGuard';
import { MAX_DOCUMENT_BYTES } from '@/lib/import/limits';
const resolver = vi.fn(async (): Promise<Address[]> => [{ address: '8.8.8.8', family: 4 }]);
function response(data = 'Item,Actual\nCloud,80', status = 200, headers: RemoteResponse['headers'] = {}): RemoteResponse {
  return { status, headers, body: (async function* () { yield Buffer.from(data); })(), close: vi.fn(async () => {}) };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('public URL boundary', () => {
  it.each(['http://10.0.0.1', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1', 'http://127.0.0.1', 'http://127.1', 'http://2130706433', 'http://0177.0.0.1', 'http://0x7f000001', 'http://169.254.169.254/latest/meta-data/', 'http://100.100.100.200', 'http://0.0.0.0', 'http://224.0.0.1', 'http://255.255.255.255', 'http://192.0.2.1', 'http://198.18.0.1', 'http://[::1]', 'http://[::]', 'http://[fc00::1]', 'http://[fe80::1]', 'http://[ff02::1]', 'http://[::ffff:127.0.0.1]', 'http://[64:ff9b::a00:1]', 'http://metadata.google.internal', 'http://foo.localhost', 'file:///etc/passwd', 'ftp://example.com', 'https://name:password@example.com'])('rejects %s before any outbound connection', async url => {
    const transport = vi.fn<Transport>();
    await expect(createSafeFetcher(resolver, transport)(url)).rejects.toThrow(/public|HTTP|credentials|Internal|metadata/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects any private answer, including mixed public/private DNS records', async () => {
    const transport = vi.fn<Transport>();
    const mixed = async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }];
    await expect(createSafeFetcher(mixed, transport)('https://public.example/data')).rejects.toThrow(/blocked address/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('pins the validated IP and retains the original hostname for HTTP/TLS', async () => {
    const lookup = vi.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const transport = vi.fn<Transport>().mockResolvedValue(response());
    await createSafeFetcher(lookup, transport)('https://public.example/data');
    expect(lookup).toHaveBeenCalledTimes(1);
    const target = transport.mock.calls[0][0];
    expect(target.address).toBe('8.8.8.8'); expect(target.url.hostname).toBe('public.example');
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
    expect(parsePublicUrl('https://example.com/#ignored').url.hash).toBe('');
  });
  it('disables redirects by default and rechecks every explicitly allowed hop', async () => {
    const redirect = response('', 302, { location: 'http://127.0.0.1/private' });
    const transport = vi.fn<Transport>().mockResolvedValue(redirect);
    await expect(createSafeFetcher(resolver, transport)('https://public.example/')).rejects.toThrow(/redirects/);
    expect(transport).toHaveBeenCalledTimes(1); expect(redirect.close).toHaveBeenCalled();
    transport.mockClear();
    await expect(createSafeFetcher(resolver, transport)('https://public.example/', { maxRedirects: 1 })).rejects.toThrow(/HTTPS to HTTP/);
    transport.mockClear(); transport.mockResolvedValue(response('', 302, { location: 'https://127.0.0.1/private' }));
    await expect(createSafeFetcher(resolver, transport)('https://public.example/', { maxRedirects: 1 })).rejects.toThrow(/public/);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('blocks DNS rebinding between redirect hops and cross-origin credential forwarding', async () => {
    const lookup = vi.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }]);
    const transport = vi.fn<Transport>().mockResolvedValue(response('', 302, { location: '/next' }));
    await expect(createSafeFetcher(lookup, transport)('https://public.example/', { maxRedirects: 1 })).rejects.toThrow(/blocked address/);
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockResolvedValue(response('', 302, { location: 'https://other.example/data' }));
    await expect(createSafeFetcher(resolver, transport)('https://public.example/', { headerName: 'Authorization', apiKey: 'Bearer synthetic-test-key', maxRedirects: 1 })).rejects.toThrow(/another origin/);
  });
  it('enforces declared, streamed, and decompressed 10 MB response limits', async () => {
    const declared = response('', 200, { 'content-length': String(MAX_DOCUMENT_BYTES + 1) });
    await expect(createSafeFetcher(resolver, async () => declared)('https://public.example/')).rejects.toThrow(/10 MB/);
    const streamed = response(); streamed.body = (async function* () { yield Buffer.alloc(MAX_DOCUMENT_BYTES); yield Buffer.from('x'); })();
    await expect(createSafeFetcher(resolver, async () => streamed)('https://public.example/')).rejects.toThrow(/10 MB/);
    const compressed = response('', 200, { 'content-encoding': 'gzip' }); compressed.body = (async function* () { yield gzipSync(Buffer.alloc(MAX_DOCUMENT_BYTES + 1)); })();
    await expect(createSafeFetcher(resolver, async () => compressed)('https://public.example/')).rejects.toThrow(/10 MB/);
  });
  it('bounds the entire operation, including DNS, at ten seconds', async () => {
    vi.useFakeTimers();
    const never = new Promise<Address[]>(() => {});
    const transport = vi.fn<Transport>();
    const assertion = expect(createSafeFetcher(async () => never, transport)('https://public.example/')).rejects.toThrow(/10 seconds/);
    await vi.advanceTimersByTimeAsync(URL_TIMEOUT_MS + 1); await assertion;
    expect(transport).not.toHaveBeenCalled();
  });
  it('forbids routing/header injection and plaintext credential transport', async () => {
    for (const name of ['Host', 'Cookie', 'Proxy-Authorization', 'Connection', 'X-Forwarded-Host', 'User-Agent', 'bad\r\nname']) expect(() => sourceHeaders(name, 'synthetic-key')).toThrow(/header/);
    expect(() => sourceHeaders('Authorization', 'key\r\ninjected')).toThrow(/header/);
    const transport = vi.fn<Transport>();
    await expect(createSafeFetcher(resolver, transport)('http://public.example/', { headerName: 'X-API-Key', apiKey: 'synthetic-test-key' })).rejects.toThrow(/HTTPS/);
    expect(transport).not.toHaveBeenCalled();
  });
});
