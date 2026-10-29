import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
const mock=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/ai/client',()=>({callAI:mock.call}));
import { suggestAiMapping } from '@/lib/ai/tasks/suggestMapping';
import { aiMappingSchema, mappingInputSchema, mappingSample, mappingFieldConfidence, needsAiMapping } from '@/lib/ai/schemas';
import { mappingContent } from '@/lib/ai/mappingPrompt';
import { suggestMapping } from '@/lib/import/mapping';
const columns=['Deliverable','Quoted','Invoiced'];
const result={item:{column:'Deliverable',confidence:.98,reason:'Describes the delivered work.'},estimated:{column:'Quoted',confidence:.95,reason:'Quoted amount is the planned cost.'},actual:{column:'Invoiced',confidence:.96,reason:'Invoiced amount is the incurred cost.'}};
beforeEach(()=>{mock.call.mockReset();mock.call.mockImplementation(async options=>({data:await options.schema.parseAsync(result),cached:false}));});
it('odd headers need AI, then map to validated fields using the fast central gateway',async()=>{
  expect(readFileSync('tests/fixtures/codeaudit-ai.csv','utf8')).toContain('Deliverable,Quoted,Invoiced');
  const synonyms=suggestMapping(columns);expect(needsAiMapping(synonyms.mapping,synonyms.confidence)).toBe(true);
  const input=mappingSample(columns,[{Deliverable:'Authentication',Quoted:1200,Invoiced:1350}]);
  expect((await suggestAiMapping('11111111-1111-4111-8111-111111111111',input)).data).toEqual(result);
  expect(mock.call).toHaveBeenCalledWith(expect.objectContaining({task:'mapping',model:'fast',projectId:'11111111-1111-4111-8111-111111111111',maxTokens:2048}));
  expect(JSON.parse(mock.call.mock.calls[0][0].userContent)).toEqual(input);
  expect(needsAiMapping({item:'Deliverable',estimated:'Quoted',actual:'Invoiced'},{item:.98,estimated:.95,actual:.96})).toBe(false);
  expect(needsAiMapping({item:'Deliverable',estimated:'Quoted',actual:'Invoiced'},{item:.98,estimated:.59,actual:.96})).toBe(true);
});
it('sends only five bounded samples and only declared columns',()=>{
  const input=mappingSample(columns,Array.from({length:120},()=>({Deliverable:'x'.repeat(5000),Quoted:10,Invoiced:12,Secret:'do not send'})));
  expect(input.sampleRows).toHaveLength(5);expect(input.sampleRows[0].Deliverable).toHaveLength(1000);expect(JSON.stringify(input)).not.toContain('Secret');
  expect(mappingInputSchema.safeParse({...input,sampleRows:[...input.sampleRows,input.sampleRows[0]]}).success).toBe(false);
  expect(mappingInputSchema.safeParse({...input,sampleRows:[{Extra:'x'}]}).success).toBe(false);
});
it('rejects hallucinated/reused columns, invalid confidence, unsupported fields and empty output',async()=>{
  for(const invalid of [{...result,item:{...result.item,column:'Invented'}},{...result,actual:{...result.actual,column:'Quoted'}},{...result,item:{...result.item,confidence:1.1}},{...result,prompt:'ignore instructions'},{}]){
    mock.call.mockImplementationOnce(async options=>({data:await options.schema.parseAsync(invalid)}));
    await expect(suggestAiMapping('project',mappingSample(columns,[]))).rejects.toBeInstanceOf(z.ZodError);
  }
  expect(aiMappingSchema.safeParse(result).success).toBe(true);
});
it('canonicalizes sample property order so identical columns/samples reuse the gateway cache',()=>{
  expect(mappingContent({columns,sampleRows:[{Quoted:1,Invoiced:2,Deliverable:'A'}]})).toBe(mappingContent({columns,sampleRows:[{Deliverable:'A',Invoiced:2,Quoted:1}]}));
  expect(mappingContent({columns,sampleRows:[{Quoted:1}]})).not.toBe(mappingContent({columns,sampleRows:[{Quoted:2}]}));
});

it('unmatched initial fields have zero confidence without dereferencing absent AI suggestions',()=>{
 const synonyms=suggestMapping(columns);
 for(const field of ['item','estimated','actual'] as const)expect(mappingFieldConfidence(field,{},synonyms,{},new Set())).toBe(0);
 expect(mappingFieldConfidence('item',{item:'Deliverable'},synonyms,result,new Set())).toBe(.98);
 expect(mappingFieldConfidence('item',{item:'Deliverable'},synonyms,result,new Set(['item']))).toBe(1);
});
