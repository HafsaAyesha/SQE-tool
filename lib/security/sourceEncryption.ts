import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ImportError } from '@/lib/import/errors';
import { onlineRequestSchema, type OnlineInput } from '@/lib/import/onlineSchema';
function key() {
  const value = process.env.SOURCE_ENCRYPTION_KEY;
  const decoded = value ? Buffer.from(value, 'base64') : null;
  if (!value || !decoded || decoded.length !== 32 || decoded.toString('base64') !== value) throw new ImportError('Saving sources is not configured. Ask the administrator to configure source encryption, or fetch without saving.', 503);
  return decoded;
}
export function assertSourceEncryptionConfigured() { key(); }
export function sourceEncryptionReady() { try { key(); return true; } catch { return false; } }
function context(projectId: string, type: string) { return Buffer.from(`CostLens:source:v1:${projectId}:${type}`, 'utf8'); }
/** Encrypt the entire configuration, including URLs which may themselves contain secret queries. */
export function encryptSourceConfig(config: OnlineInput, projectId: string, type: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(context(projectId, type));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(onlineRequestSchema.parse(config)), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), bytes]).toString('base64url');
}
export function decryptSourceConfig(value: string, projectId: string, type: string): OnlineInput {
  try {
    if (value.length > 65536 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid envelope');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 30 || bytes[0] !== 1) throw new Error('invalid version');
    const cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(1, 13));
    cipher.setAAD(context(projectId, type)); cipher.setAuthTag(bytes.subarray(13, 29));
    return onlineRequestSchema.parse(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(29)), cipher.final()]).toString('utf8')));
  } catch { throw new ImportError('This saved source could not be decrypted. Check the server encryption key and source configuration.', 500); }
}
