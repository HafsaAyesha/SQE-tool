import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, SUPABASE_HOME: process.env.SUPABASE_HOME || '/workspace/.supabase-cli', SUPABASE_USE_SLIM_IMAGES: 'true' };
let status;
try {
  status = JSON.parse(execFileSync(`${root}/node_modules/.bin/supabase`, ['status', '--output', 'json'], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
} catch {
  console.error('Local Supabase is not ready. Start the local stack using docs/supabase.md first.');
  process.exit(1);
}
if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  console.error('Local Supabase status did not provide the required connection fields. No credential values were printed.');
  process.exit(1);
}
if (!['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname)) {
  console.error('Refusing a non-local target in the local validation runner.');
  process.exit(1);
}
const testEnv = { ...env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, COSTLENS_REQUIRE_LIVE_RLS: '1', SOURCE_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
const commands = process.argv.includes('--e2e') ? ['test:e2e'] : process.argv.includes('--browser') ? ['build', 'test:e2e'] : [process.argv.includes('--all') ? 'test' : 'test:rls'];
if (process.argv.includes('--browser') || process.argv.includes('--e2e')) testEnv.COSTLENS_LOCAL_AUTH_E2E = '1';
const separator = process.argv.indexOf('--');
const testArgs = separator === -1 ? [] : process.argv.slice(separator + 1);
for (const command of commands) {
  const result = spawnSync('npm', ['run', command, ...(command === 'test:e2e' && testArgs.length ? ['--', ...testArgs] : [])], { cwd: root, stdio: 'inherit', env: testEnv });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
