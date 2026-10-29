import{afterAll,beforeAll,expect,it}from'vitest';
import{PGlite}from'@electric-sql/pglite';
import{readFileSync}from'node:fs';
const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
async function as(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
beforeAll(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}');`);
  for(const file of ['0001_init.sql','0002_project_summaries.sql','0003_online_source_config.sql','0004_import_commit.sql','0005_ai_foundation.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
},30000);
afterAll(()=>db.close());
it('applies all migrations fresh and enables RLS on all seven tables',async()=>{
  const tables=await db.query<{tablename:string;rowsecurity:boolean}>("select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename");expect(tables.rows).toHaveLength(7);expect(tables.rows.every(row=>row.rowsecurity)).toBe(true);
});
it('allows only owner reads and server inserts for AI usage',async()=>{
  await db.query("insert into ai_usage(user_id,task,model,input_tokens,output_tokens) values($1,'test','configured',10,5)",[a]);await as(a);expect((await db.query('select * from ai_usage')).rows).toHaveLength(1);await expect(db.query("insert into ai_usage(user_id,task,model) values($1,'test','fake')",[a])).rejects.toThrow(/permission denied/);await expect(db.query('update ai_usage set input_tokens=0')).rejects.toThrow(/permission denied/);await as(b);expect((await db.query('select * from ai_usage')).rows).toEqual([]);await expect(db.query('select * from ai_cache')).rejects.toThrow(/permission denied/);
});
it('defaults masking on and isolates preference reads/writes by user',async()=>{
  await as(a);await db.query('insert into user_preferences(user_id) values($1)',[a]);expect((await db.query<{mask_personal_data:boolean}>('select mask_personal_data from user_preferences')).rows[0].mask_personal_data).toBe(true);await db.exec('update user_preferences set mask_personal_data=false');await as(b);expect((await db.query('select * from user_preferences')).rows).toEqual([]);await expect(db.query('insert into user_preferences(user_id) values($1)',[a])).rejects.toThrow(/row-level security/);expect((await db.query('update user_preferences set mask_personal_data=true returning user_id')).rows).toEqual([]);
});
