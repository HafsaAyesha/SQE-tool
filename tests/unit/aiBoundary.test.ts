import{expect,it}from'vitest';
import{execFileSync}from'node:child_process';
import{readFileSync}from'node:fs';
it('keeps every production Anthropic SDK import inside the server-only gateway',()=>{
  const files=execFileSync('rg',['--files','lib','app','components'],{encoding:'utf8'}).trim().split('\n').filter(file=>/\.[tj]sx?$/.test(file));
  const imports=files.filter(file=>readFileSync(file,'utf8').includes('@anthropic-ai/sdk'));
  expect(imports).toEqual(['lib/ai/client.ts']);expect(readFileSync('lib/ai/client.ts','utf8').startsWith("import 'server-only';")).toBe(true);
});
