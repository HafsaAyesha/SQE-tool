import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
it('keeps secrets empty, disables the demo by default and ignores private env files', () => {
  const template = readFileSync('.env.example', 'utf8');
  const entries = template.split('\n').filter(line => line && !line.startsWith('#'));
  expect(entries.map(line => line.split('=')[0]).sort()).toEqual([
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'DEMO_ENABLED', 'DEMO_EMAIL', 'DEMO_PASSWORD', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'APP_URL', 'WORKER_URL', 'WORKER_SECRET', 'SOURCE_ENCRYPTION_KEY', 'GEMINI_MODEL_SMART', 'GEMINI_MODEL_FAST', 'TRUST_PROXY_HEADERS',
  ].sort());
  const defaults:Record<string,string>={DEMO_ENABLED:'false',DEMO_EMAIL:'demo@costlens.example'};
  for(const line of entries){const [name,value]=line.split('=');expect(value,name).toBe(defaults[name]??'');}
  for (const file of ['.env', '.env.local', '.env.production']) {
    expect(execFileSync('git', ['check-ignore', file], { encoding: 'utf8' }).trim()).toBe(file);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  expect(tracked.filter(file => /(^|\/)\.env(?:$|\.)/.test(file) && !file.endsWith('.env.example'))).toEqual([]);
});


it('keeps worker-only imports out of the real Next.js production TypeScript graph',async()=>{
  const ts=await import('typescript');
  const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);expect(config.error).toBeUndefined();
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());expect(parsed.errors).toEqual([]);
  const program=ts.createProgram({rootNames:parsed.fileNames,options:parsed.options});
  const files=program.getSourceFiles().map(file=>file.fileName.replaceAll('\\','/'));
  expect(files.some(file=>file.endsWith('/app/page.tsx'))).toBe(true);
  expect(files.some(file=>file.includes('/worker/src/')||file.includes('/tests/'))).toBe(false);
},30000);
