import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
it('keeps the complete environment template empty and ignores private env files', () => {
  const template = readFileSync('.env.example', 'utf8');
  const entries = template.split('\n').filter(line => line && !line.startsWith('#'));
  expect(entries.map(line => line.split('=')[0]).sort()).toEqual([
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY', 'OPENAI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'APP_URL', 'WORKER_URL', 'WORKER_SECRET', 'SOURCE_ENCRYPTION_KEY', 'GEMINI_MODEL_SMART', 'GEMINI_MODEL_FAST', 'TRUST_PROXY_HEADERS',
  ].sort());
  expect(entries.every(line => line.endsWith('=') && line.split('=')[1] === '')).toBe(true);
  for (const file of ['.env', '.env.local', '.env.production']) {
    expect(execFileSync('git', ['check-ignore', file], { encoding: 'utf8' }).trim()).toBe(file);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  expect(tracked.filter(file => /(^|\/)\.env(?:$|\.)/.test(file) && !file.endsWith('.env.example'))).toEqual([]);
});
