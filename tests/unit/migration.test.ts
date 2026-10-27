import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const project = '33333333-3333-4333-8333-333333333333';
const source = '44444444-4444-4444-8444-444444444444';
async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0002_project_summaries.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0003_online_source_config.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
describe.sequential('migration and Postgres ownership policies', () => {
  it('enables RLS on every table and gives ai_cache no policies', async () => {
    const tables = await db.query<{relname: string; relrowsecurity: boolean}>("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'");
    expect(tables.rows).toHaveLength(5);
    expect(tables.rows.every(row => row.relrowsecurity)).toBe(true);
    expect((await db.query("select * from pg_policies where tablename = 'ai_cache'")).rows).toHaveLength(0);
  });
  it('allows owners to insert, read and update their projects and children', async () => {
    await asUser(alice);
    await db.query('insert into projects(id, owner_id, name) values ($1,$2,$3)', [project, alice, 'CodeAudit']);
    await db.query('insert into data_sources(id, project_id, type) values ($1,$2,$3)', [source, project, 'csv']);
    await db.query('insert into cost_items(project_id, source_id, item, actual) values ($1,$2,$3,$4)', [project, source, 'Cloud', 12.5]);
    await db.query('insert into mapping_templates(owner_id, source_type, name, mapping) values ($1,$2,$3,$4)', [alice, 'csv', 'Default', '{}']);
    for (const table of ['projects', 'data_sources', 'cost_items', 'mapping_templates']) {
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
    }
    expect((await db.query("update projects set name = 'Updated' returning id")).rows).toHaveLength(1);
    expect((await db.query("update data_sources set name = 'Costs' returning id")).rows).toHaveLength(1);
    expect((await db.query("update cost_items set actual = 14 returning id")).rows).toHaveLength(1);
    expect((await db.query("update mapping_templates set name = 'Updated' returning id")).rows).toHaveLength(1);
  });
  it('blocks another user from reading, updating, deleting or inserting into owned records', async () => {
    await asUser(bob);
    for (const table of ['projects', 'data_sources', 'cost_items', 'mapping_templates']) {
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
      expect((await db.query(`delete from ${table} returning id`)).rows).toHaveLength(0);
    }
    expect((await db.query("update projects set name = 'Stolen' returning id")).rows).toHaveLength(0);
    expect((await db.query("update data_sources set name = 'Stolen' returning id")).rows).toHaveLength(0);
    expect((await db.query("update cost_items set item = 'Stolen' returning id")).rows).toHaveLength(0);
    expect((await db.query("update mapping_templates set name = 'Stolen' returning id")).rows).toHaveLength(0);
    await expect(db.query("insert into projects(owner_id, name) values ($1,'Stolen')", [alice])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into data_sources(project_id, type) values ($1,'csv')", [project])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into cost_items(project_id, item) values ($1,'Stolen')", [project])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into mapping_templates(owner_id, source_type, name, mapping) values ($1,'csv','Stolen','{}')", [alice])).rejects.toThrow(/row-level security/);
  });
  it('prevents changing ownership or moving children to someone else’s project', async () => {
    await db.query("insert into projects(owner_id, name) values ($1,'Bob')", [bob]);
    const bobProject = (await db.query<{id: string}>('select id from projects')).rows[0].id;
    await asUser(alice);
    await expect(db.query('update projects set owner_id = $1', [bob])).rejects.toThrow(/row-level security/);
    await expect(db.query('update data_sources set project_id = $1', [bobProject])).rejects.toThrow(/row-level security/);
    await expect(db.query('update cost_items set project_id = $1', [bobProject])).rejects.toThrow(/row-level security/);
    await expect(db.query('update mapping_templates set owner_id = $1', [bob])).rejects.toThrow(/row-level security/);
  });
  it('blocks cross-project source references and invalid values', async () => {
    const other = (await db.query<{id: string}>("insert into projects(owner_id, name) values ($1,'Other') returning id", [alice])).rows[0].id;
    await expect(db.query("insert into cost_items(project_id, source_id, item) values ($1,$2,'Bad reference')", [other, source])).rejects.toThrow(/foreign key/);
    await expect(db.query('insert into projects(owner_id, name) values ($1,$2)', [alice, 'x'.repeat(121)])).rejects.toThrow(/check constraint/);
    await expect(db.query("insert into cost_items(project_id,item,confidence) values ($1,'Bad',1.1)", [project])).rejects.toThrow(/check constraint/);
  });
  it('denies ai_cache access for authenticated and anonymous roles', async () => {
    await expect(db.query('select * from ai_cache')).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into ai_cache values ('hash','summary','{}',now())")).rejects.toThrow(/permission denied/);
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from ai_cache')).rejects.toThrow(/permission denied/);
    // Supabase may grant anon table privileges by default; RLS must still return no rows.
    await db.exec('reset role; grant select on projects, data_sources, cost_items, mapping_templates to anon; set role anon');
    for (const table of ['projects', 'data_sources', 'cost_items', 'mapping_templates']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  });
  it('summary view applies caller RLS and aggregates only the project currency', async () => {
    await asUser(alice);
    await db.query("insert into cost_items(project_id,item,actual,currency) values ($1,'Other currency',999,'EUR')", [project]);
    const rows = (await db.query<{id: string; total_actual: string; item_count: number; other_currency_count: number; owner_id: string}>('select * from project_summaries')).rows;
    expect(rows.every(row => row.owner_id === alice)).toBe(true);
    expect(rows.find(row => row.id === project)).toMatchObject({ total_actual: '14.00', item_count: 2, other_currency_count: 1 });
    await asUser(bob);
    expect((await db.query<{owner_id: string}>('select * from project_summaries')).rows.every(row => row.owner_id === bob)).toBe(true);
    expect((await db.query('select * from project_summaries where id = $1', [project])).rows).toHaveLength(0);
  });
  it('allows owner deletes, preserves costs on source deletion and cascades project deletion', async () => {
    await asUser(alice);
    await db.query('delete from data_sources where id = $1', [source]);
    expect((await db.query<{source_id: string | null}>('select source_id from cost_items')).rows.every(row => row.source_id === null)).toBe(true);
    await db.query('delete from projects where id = $1', [project]);
    expect((await db.query('select * from cost_items')).rows).toHaveLength(0);
    expect((await db.query('delete from mapping_templates returning id')).rows).toHaveLength(1);
  });
});
