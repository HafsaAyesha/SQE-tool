import{expect,it}from'vitest';
import{execFileSync}from'node:child_process';
import{readFileSync}from'node:fs';
it('keeps every production Gemini HTTP request inside the server-only gateway',()=>{
  const files=execFileSync('rg',['--files','lib','app','components'],{encoding:'utf8'}).trim().split('\n').filter(file=>/\.[tj]sx?$/.test(file));
  const imports=files.filter(file=>readFileSync(file,'utf8').includes('generativelanguage.googleapis.com'));
  expect(files.some(file=>readFileSync(file,'utf8').includes('@anthropic-ai/sdk'))).toBe(false);expect(imports).toEqual(['lib/ai/client.ts']);expect(readFileSync('lib/ai/client.ts','utf8').startsWith("import 'server-only';")).toBe(true);
});

it('keeps private environment variables and server-only modules out of the client import graph',async()=>{
  const ts=await import('typescript'),path=await import('node:path'),fs=await import('node:fs');
  const roots=execFileSync('rg',['--files','app','components','lib'],{encoding:'utf8'}).trim().split('\n').filter(file=>/\.[jt]sx?$/.test(file)&&/^['"]use client['"]/m.test(readFileSync(file,'utf8')));
  const visited=new Set<string>(),allowed=new Set(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  function walk(file:string){
    if(visited.has(file))return;visited.add(file);const source=readFileSync(file,'utf8');if(/^['"]use server['"]/m.test(source))return;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=(node:import('typescript').Node)=>{
      if(ts.isPropertyAccessExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(ast)==='process'&&node.expression.name.text==='env')expect(allowed.has(node.name.text),`${file}: ${node.name.text} must stay server-only`).toBe(true);
      if(ts.isElementAccessExpression(node)&&node.expression.getText(ast)==='process.env')throw new Error(`${file}: dynamic client environment access is forbidden`);
      if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
        const typeOnly=ts.isImportDeclaration(node)?node.importClause?.isTypeOnly:node.isTypeOnly;
        const specifierNode=node.moduleSpecifier;if(!typeOnly&&specifierNode&&ts.isStringLiteral(specifierNode)){
          const specifier=specifierNode.text;expect(specifier,`${file}: server-only dependency`).not.toBe('server-only');expect(specifier,`${file}: Node dependency`).not.toMatch(/^node:/);
          if(specifier.startsWith('@/')||specifier.startsWith('.')){const base=specifier.startsWith('@/')?path.resolve(specifier.slice(2)):path.resolve(path.dirname(file),specifier);const resolved=[base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'].find(candidate=>fs.existsSync(candidate));if(resolved)walk(resolved);}
        }
      }
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  for(const root of roots)walk(path.resolve(root));expect(visited.size).toBeGreaterThan(20);
});
