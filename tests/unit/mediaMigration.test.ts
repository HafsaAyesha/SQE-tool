import {afterAll,beforeAll,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333',job='44444444-4444-4444-8444-444444444444';
async function as(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',email text,encrypted_password text,phone text,email_change text,phone_change text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;insert into auth.users(id) values('${a}'),('${b}');`);
 await db.exec(readFileSync('docs/production-migrations.sql','utf8'));
 await db.query('insert into projects(id,owner_id,name) values($1,$2,$3)',[project,a,'Media RLS']);await db.query("insert into jobs(id,project_id,type,storage_path,file_name,mime_type,expected_size) values($1,$2,'audio',$3,'meeting.mp3','audio/mpeg',100)",[job,project,`${project}/${job}.mp3`]);
},30000);
afterAll(()=>db.close());
it('creates a private 500MB bucket, server-written jobs and owner-only reads/uploads',async()=>{
 expect((await db.query<{public:boolean;file_size_limit:number}>('select public,file_size_limit from storage.buckets')).rows[0]).toMatchObject({public:false,file_size_limit:524288000});
 await as(a);expect((await db.query('select id from jobs')).rows).toHaveLength(1);await expect(db.query("update jobs set status='done'")).rejects.toThrow(/permission denied/);await db.query("insert into storage.objects(bucket_id,name) values('media-uploads',$1)",[`${project}/${job}.mp3`]);await as(b);expect((await db.query('select id from jobs')).rows).toEqual([]);expect((await db.query('select * from storage.objects')).rows).toEqual([]);await expect(db.query("insert into storage.objects(bucket_id,name) values('media-uploads',$1)",[`${project}/${job}.mp3`])).rejects.toThrow(/row-level security/);await expect(db.query('select * from claim_media_job($1)',[job])).rejects.toThrow(/permission denied/);
});
it('claims once and closes an upload reservation so signed tokens cannot recreate it later',async()=>{
 await db.exec('reset role');await db.query("update jobs set upload_complete=true,consent_transcription=true where id=$1",[job]);expect((await db.query('select * from claim_media_job($1)',[job])).rows).toHaveLength(1);expect((await db.query('select * from claim_media_job($1)',[job])).rows).toHaveLength(0);await expect(db.query("insert into storage.objects(bucket_id,name) values('media-uploads',$1)",[`${project}/${job}.mp3`])).rejects.toThrow(/reservation is closed/);
});

it('invalidates only summary cache entries after cost inserts, updates and deletes',async()=>{
 await db.exec('reset role');const cost='55555555-5555-4555-8555-555555555555';
 async function seed(){await db.query("insert into ai_cache(hash,kind,result,user_id,project_id) values('summary-fixture','summary','{}',$1,$2) on conflict(hash) do nothing",[a,project]);}
 await db.query("insert into ai_cache(hash,kind,result,user_id,project_id) values('extraction-fixture','extraction','{}',$1,$2)",[a,project]);
 await seed();await as(a);await db.query("insert into cost_items(id,project_id,item,estimated,actual) values($1,$2,'AI API',100,900)",[cost,project]);await db.exec('reset role');expect((await db.query("select hash from ai_cache where kind='summary'")).rows).toEqual([]);
 await seed();await as(a);await db.query('update cost_items set actual=901 where id=$1',[cost]);await db.exec('reset role');expect((await db.query("select hash from ai_cache where kind='summary'")).rows).toEqual([]);
 await seed();await as(a);await db.query('delete from cost_items where id=$1',[cost]);await db.exec('reset role');expect((await db.query("select hash from ai_cache where kind='summary'")).rows).toEqual([]);expect((await db.query("select hash from ai_cache where kind='extraction'")).rows).toHaveLength(1);
});


it('reuses the migration bundle safely and makes the public demo read-only even with an old JWT',async()=>{
 await db.exec('reset role');await db.exec(readFileSync('docs/production-migrations.sql','utf8'));
 expect((await db.query('select version from supabase_migrations.schema_migrations')).rows).toHaveLength(8);
 const status=(await db.query<{production_security_status:{demoProtection:boolean;mediaBucketPrivate:boolean;tables:{rls:boolean}[]}}>('select public.production_security_status()')).rows[0].production_security_status;
 expect(status.demoProtection).toBe(true);expect(status.mediaBucketPrivate).toBe(true);expect(status.tables.every(table=>table.rls)).toBe(true);
 await db.query(`update auth.users set raw_app_meta_data='{"costlens_demo":true}' where id=$1`,[a]);await as(a);
 expect((await db.query('select id from projects where id=$1',[project])).rows).toHaveLength(1);
 await expect(db.query("insert into projects(owner_id,name) values($1,'Must be denied')",[a])).rejects.toThrow(/row-level security/);
 expect((await db.query("update projects set name='Changed' returning id")).rows).toEqual([]);
 expect((await db.query('delete from projects returning id')).rows).toEqual([]);
 await expect(db.query("insert into cost_items(project_id,item) values($1,'Denied')",[project])).rejects.toThrow(/row-level security/);
 await expect(db.query('select public.production_security_status()')).rejects.toThrow(/permission denied/);
 await db.exec('reset role');await expect(db.query("update auth.users set encrypted_password='changed' where id=$1",[a])).rejects.toThrow(/demo credentials cannot be changed/);
 await db.query("update auth.users set encrypted_password='normal-account-change' where id=$1",[b]);
});
