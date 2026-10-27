import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
it('keeps the complete environment template empty and ignores private env files', () => {
  const template = readFileSync('.env.example', 'utf8');
  const entries = template.split('\n').filter(line => line && !line.startsWith('#'));
  expect(entries.map(line => line.split('=')[0]).sort()).toEqual([
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'WORKER_URL', 'WORKER_SECRET', 'SOURCE_ENCRYPTION_KEY',
  ].sort());
  expect(entries.every(line => line.endsWith('=') && line.split('=')[1] === '')).toBe(true);
  for (const file of ['.env', '.env.local', '.env.production']) {
    expect(execFileSync('git', ['check-ignore', file], { encoding: 'utf8' }).trim()).toBe(file);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  expect(tracked.filter(file => /(^|\/)\.env(?:$|\.)/.test(file) && !file.endsWith('.env.example'))).toEqual([]);
});
