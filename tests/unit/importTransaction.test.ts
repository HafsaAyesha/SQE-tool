import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
let project: string; let source: string;
const row = { item:'Cloud', group:'Build', category:null, estimated:100, actual:80, currency:'USD', date:'2025-01-01', notes:null, sourceRef:'row 2', confidence:null };
async function as(id: string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
async function commit(rows: unknown[], id: string | null = null, mode = 'append', template: string | null = null, target = project) {
  return db.query<{ result: {sourceId:string; count:number} }>('select public.commit_cost_import($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8) as result', [target,id,'csv','costs.csv',JSON.stringify({columns:['Item'],mapping:{item:'Item'},currency:'USD'}),mode,JSON.stringify(rows),template]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; insert into auth.users values('${a}'),('${b}');`);
  for (const file of ['0001_init.sql','0002_project_summaries.sql','0003_online_source_config.sql','0004_import_commit.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  await as(a);
  project = (await db.query<{id:string}>("insert into projects(owner_id,name) values($1,'Imports') returning id",[a])).rows[0].id;
},30000);
afterAll(() => db.close());
it('atomically creates a source, costs and an owner-scoped mapping template', async () => {
  const result = (await commit([row],null,'append','CSV template')).rows[0].result; source=result.sourceId;
  expect(result.count).toBe(1);
  expect((await db.query('select * from cost_items where source_id=$1',[source])).rows).toHaveLength(1);
  expect((await db.query<{last_imported_at:unknown}>('select last_imported_at from data_sources where id=$1',[source])).rows[0].last_imported_at).toBeTruthy();
  expect((await db.query('select * from mapping_templates')).rows).toHaveLength(1);
});
it('appends and replaces only the chosen source, preserving manual rows', async () => {
  await db.query("insert into cost_items(project_id,item) values($1,'Manual')",[project]);
  await commit([row],source); expect((await db.query('select * from cost_items where source_id=$1',[source])).rows).toHaveLength(2);
  await commit([{...row,item:'Replacement'}],source,'replace');
  expect((await db.query<{item:string}>('select item from cost_items order by item')).rows.map(r=>r.item)).toEqual(['Manual','Replacement']);
});
it('rolls back replacement deletion and inserts when later template saving fails', async () => {
  await expect(commit([{...row,item:'Must roll back'}],source,'replace','x'.repeat(121))).rejects.toThrow();
  expect((await db.query<{item:string}>('select item from cost_items where source_id=$1',[source])).rows[0].item).toBe('Replacement');
});
it('rejects invalid costs through direct RPC and leaves sources and costs unchanged', async () => {
  const before = (await db.query('select * from data_sources')).rows.length;
  for (const invalid of [{...row,item:''},{...row,actual:1.234},{...row,notes:'x'.repeat(10000)},{...row,date:'2025-02-30'},{...row,actual:1e12}]) await expect(commit([invalid])).rejects.toThrow();
  expect((await db.query('select * from data_sources')).rows).toHaveLength(before);
});
it('escapes formula-like text even through a direct authenticated RPC', async () => {
  const result = (await commit([{...row,item:'=1+1',notes:'@literal'}])).rows[0].result;
  expect((await db.query<{item:string;notes:string}>('select item,notes from cost_items where source_id=$1',[result.sourceId])).rows[0]).toEqual({item:"'=1+1",notes:"'@literal"});
});
it('prevents cross-project source replacement and user B importing into A', async () => {
  const other = (await db.query<{id:string}>("insert into projects(owner_id,name) values($1,'Other') returning id",[a])).rows[0].id;
  await expect(commit([row],source,'replace',null,other)).rejects.toThrow(/Source not found/);
  await as(b); await expect(commit([row])).rejects.toThrow(/Project not found/);
  expect((await db.query('select * from mapping_templates')).rows).toHaveLength(0);
});
