import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({project:vi.fn(),rows:vi.fn(),ai:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('@/lib/supabase/requireProject',()=>({requireProject:mocks.project}));vi.mock('@/lib/projects/data',()=>({loadCostItems:mocks.rows}));vi.mock('@/lib/ai/client',()=>({callAI:mocks.ai}));
import {summariseProject} from '@/lib/ai/tasks/summarise';
import {insightSummarySchema} from '@/lib/ai/summaryPrompt';
import {summaryData} from '@/lib/ai/summaryData';
import type {CostTableRow} from '@/lib/costs/types';
const wordSummary=Array.from({length:160},()=> 'Review').join(' ');
const rows:CostTableRow[]=Array.from({length:6},(_,index)=>({id:'row-'+index,item:index===5?'AI API alice@example.com':'Item '+index,group:'Build',category:'Tools',estimated:100,actual:index===5?900:100,currency:'USD',date:'2026-10-01',notes:null,sourceRef:null,confidence:null,sourceId:null,sourceName:null,type:'manual'}));
const output={headline:'Review AI API usage',summary:wordSummary,keyFindings:['Variance needs review','Estimates are present','Source costs are visible'],anomalies:[{rowId:'row_1',likelyCause:'Usage may exceed the plan.',suggestedAction:'Check the invoice and usage limits.'}],recommendations:['Check invoices','Review budgets','Remove confirmed duplicates']};
beforeEach(()=>{vi.resetAllMocks();mocks.project.mockResolvedValue({currency:'USD',owner_id:'private-user-id'});mocks.rows.mockResolvedValue(rows);mocks.ai.mockImplementation(async options=>({data:await options.schema.parseAsync(output),cached:false,generatedAt:'2026-10-28T00:00:00Z'}));});
it('uses authoritative totals/groups/categories, sends no user/project/source ids and uses the smart gateway',async()=>{
 const result=await summariseProject('project-id');expect(result.flags.some(flag=>flag.rowId==='row-5')).toBe(true);expect(mocks.ai).toHaveBeenCalledWith(expect.objectContaining({task:'summary',projectId:'project-id',model:'smart',refresh:false}));const content=JSON.parse(mocks.ai.mock.calls[0][0].userContent);expect(content.totals).toMatchObject({estimated:600,actual:1400,variance:800});expect(content.byGroup[0].key).toBe('Build');expect(content.byCategory[0].key).toBe('Tools');expect(content.flaggedRows[0].rowId).toBe('row_1');expect(result.data.anomalies[0].rowId).toBe('row-5');expect(JSON.stringify(content)).not.toContain('private-user-id');expect(JSON.stringify(content)).not.toContain('project-id');
});
it('fingerprints all fields and ignores input order; any cost edit changes the cache input',()=>{
 const a=summaryData(rows,'USD');expect(summaryData([...rows].reverse(),'USD').dataHash).toBe(a.dataHash);expect(summaryData(rows.map((row,n)=>n?row:{...row,notes:'changed'}),'USD').dataHash).not.toBe(a.dataHash);expect(summaryData(rows.map((row,n)=>n?row:{...row,actual:101}),'USD').dataHash).not.toBe(a.dataHash);
});
it('validates word count, exact findings/recommendations and every anomaly id',async()=>{
 expect(insightSummarySchema.safeParse({...output,summary:'Too short.'}).success).toBe(false);expect(insightSummarySchema.safeParse({...output,recommendations:['one']}).success).toBe(false);
 mocks.ai.mockImplementationOnce(async options=>({data:await options.schema.parseAsync({...output,anomalies:[{...output.anomalies[0],rowId:'foreign-row'}]})}));await expect(summariseProject('project')).rejects.toThrow();
});
it('filters consistently, bypasses cache only for explicit regeneration and rejects an empty cohort',async()=>{
 await summariseProject('project',{regenerate:true});expect(mocks.ai.mock.calls[0][0].refresh).toBe(true);mocks.rows.mockResolvedValueOnce([]);await expect(summariseProject('project')).rejects.toMatchObject({status:400});expect(mocks.ai).toHaveBeenCalledTimes(1);
});
