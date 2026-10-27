import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { encryptSourceConfig, decryptSourceConfig, sourceEncryptionReady } from '@/lib/security/sourceEncryption';
const input = { type: 'url' as const, url: 'https://example.com/data?private=synthetic-query-key', headerName: 'X-API-Key', apiKey: 'synthetic-test-key', saveSource: true };
afterEach(() => vi.unstubAllEnvs());
it('encrypts the whole configuration using unique IVs and project/type authenticated context', () => {
  vi.stubEnv('SOURCE_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  const first = encryptSourceConfig(input, 'project-a', 'url');
  const second = encryptSourceConfig(input, 'project-a', 'url');
  expect(first).not.toBe(second);
  expect(first).not.toContain(input.apiKey);
  expect(Buffer.from(first, 'base64url').toString('utf8')).not.toContain(input.url);
  expect(decryptSourceConfig(first, 'project-a', 'url')).toEqual(input);
  expect(() => decryptSourceConfig(first, 'project-b', 'url')).toThrow(/could not be decrypted/);
  expect(() => decryptSourceConfig(first, 'project-a', 'html')).toThrow(/could not be decrypted/);
  const tampered = Buffer.from(first, 'base64url'); tampered[30] ^= 1;
  expect(() => decryptSourceConfig(tampered.toString('base64url'), 'project-a', 'url')).toThrow(/could not be decrypted/);
});
it('never falls back to plaintext when the server key is missing or malformed', () => {
  for (const key of ['', 'bad-value', Buffer.alloc(16).toString('base64')]) {
    vi.stubEnv('SOURCE_ENCRYPTION_KEY', key);
    expect(sourceEncryptionReady()).toBe(false);
    expect(() => encryptSourceConfig(input, 'project', 'url')).toThrow(/not configured/);
  }
});
