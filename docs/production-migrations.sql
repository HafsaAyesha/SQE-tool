-- CostLens production migration bundle. Generated from supabase/migrations.
-- For a NEW project, or one already tracked by Supabase CLI migration history.
-- Existing untracked/manual schemas must be reconciled first; never drop real data.
-- Each migration is atomic and recorded only after success. Re-running skips applied versions.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);

-- 0001_init.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0001') then
  execute $costlens_ddl$create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  name text,
  mapping jsonb,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  last_imported_at timestamptz,
  unique (id, project_id)
);
create table public.cost_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid,
  item text not null,
  grp text,
  category text,
  estimated numeric(14,2),
  actual numeric(14,2),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  date date,
  notes text,
  source_ref text,
  confidence real check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key (source_id, project_id) references public.data_sources(id, project_id) on delete set null (source_id)
);
create table public.mapping_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  name text not null,
  mapping jsonb not null
);
create table public.ai_cache (
  hash text primary key,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);
create index data_sources_project_id_idx on public.data_sources(project_id);
create index cost_items_project_id_idx on public.cost_items(project_id);
create index cost_items_source_id_idx on public.cost_items(source_id);
create index mapping_templates_owner_id_idx on public.mapping_templates(owner_id);

alter table public.projects enable row level security;
alter table public.data_sources enable row level security;
alter table public.cost_items enable row level security;
alter table public.mapping_templates enable row level security;
alter table public.ai_cache enable row level security;

-- ALL applies to SELECT, INSERT, UPDATE and DELETE. WITH CHECK protects new ownership.
create policy projects_owner on public.projects for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy data_sources_owner on public.data_sources for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy cost_items_owner on public.cost_items for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy mapping_templates_owner on public.mapping_templates for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- No client policies or privileges on ai_cache. Only trusted service-role code may use it.
grant select, insert, update, delete on public.projects, public.data_sources, public.cost_items, public.mapping_templates to authenticated;
revoke all on public.ai_cache from public, anon, authenticated;
grant all on public.projects, public.data_sources, public.cost_items, public.mapping_templates, public.ai_cache to service_role;$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0001','init');
 end if;
end $costlens_bundle$;

-- 0002_project_summaries.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0002') then
  execute $costlens_ddl$-- security_invoker applies the caller's RLS to both projects and cost_items.
create view public.project_summaries with (security_invoker = true) as
select p.id, p.owner_id, p.name, p.currency, p.created_at,
  count(c.id)::integer as item_count,
  coalesce(sum(c.estimated) filter (where c.currency = p.currency), 0) as total_estimated,
  coalesce(sum(c.actual) filter (where c.currency = p.currency), 0) as total_actual,
  count(c.id) filter (where c.currency <> p.currency)::integer as other_currency_count
from public.projects p
left join public.cost_items c on c.project_id = p.id
group by p.id;
grant select on public.project_summaries to authenticated;
revoke all on public.project_summaries from anon;$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0002','project_summaries');
 end if;
end $costlens_bundle$;

-- 0003_online_source_config.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0003') then
  execute $costlens_ddl$alter table public.data_sources add column config_encrypted text;
alter table public.data_sources add constraint data_sources_encrypted_size check (config_encrypted is null or char_length(config_encrypted) <= 65536);
comment on column public.data_sources.config_encrypted is 'Versioned AES-256-GCM envelope; URL, auth header and API key are encrypted together. Key is server-only, never in the database.';$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0003','online_source_config');
 end if;
end $costlens_bundle$;

-- 0004_import_commit.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0004') then
  execute $costlens_ddl$alter table public.mapping_templates add column if not exists created_at timestamptz not null default now();
create index if not exists mapping_templates_owner_created_idx on public.mapping_templates(owner_id, created_at desc);
create or replace function public.import_literal(value text) returns text
language sql immutable strict set search_path = public, pg_temp as $$
  select case when value ~ '^[[:space:][:cntrl:]]*[=+@-]' then chr(39) || value else value end;
$$;
revoke all on function public.import_literal(text) from public, anon;
grant execute on function public.import_literal(text) to authenticated;
-- A single RPC invocation is a transaction; failure rolls back deletion, insertion and template saving.
create or replace function public.commit_cost_import(p_project uuid, p_source uuid, p_type text, p_name text, p_mapping jsonb, p_mode text, p_rows jsonb, p_template_name text default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_source uuid; v_count integer;
begin
  perform 1 from public.projects where id = p_project and owner_id = auth.uid() for update;
  if not found then raise exception 'Project not found' using errcode = '42501'; end if;
  if p_mode not in ('append', 'replace') or p_mode is null or p_type is null or char_length(p_type) not between 1 and 80 or p_name is null or char_length(p_name) not between 1 and 255 then raise exception 'Invalid source'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid rows'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 1 and 5000 then raise exception 'Import must contain 1 to 5000 rows'; end if;
  if jsonb_typeof(p_mapping) is distinct from 'object' then raise exception 'Invalid mapping'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) is distinct from 'object') then raise exception 'Invalid row'; end if;
  -- Validate here as well, so direct authenticated RPC calls cannot bypass the route's Zod gate.
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(item text, "group" text, category text, estimated numeric, actual numeric, currency text, date text, notes text, "sourceRef" text, confidence real)
    where item is null or char_length(btrim(item)) < 1 or char_length(public.import_literal(item)) > 200 or char_length(public.import_literal("group")) > 120 or char_length(public.import_literal(category)) > 80 or char_length(public.import_literal(notes)) > 2000 or char_length(public.import_literal("sourceRef")) > 512
    or currency is null or currency !~ '^[A-Z]{3}$'
    or estimated::text in ('NaN','Infinity','-Infinity') or actual::text in ('NaN','Infinity','-Infinity')
    or abs(estimated) > 999999999999.99 or abs(actual) > 999999999999.99 or estimated <> round(estimated,2) or actual <> round(actual,2)
    or confidence::text in ('NaN','Infinity','-Infinity') or confidence < 0 or confidence > 1
    or (date is not null and (date !~ '^\d{4}-\d{2}-\d{2}$' or date::date::text <> date))) then raise exception 'Invalid cost row'; end if;
  if p_source is not null then
    select id into v_source from public.data_sources where id = p_source and project_id = p_project and type = p_type for update;
    if v_source is null then raise exception 'Source not found' using errcode = '42501'; end if;
  else
    if p_mode = 'replace' then raise exception 'Select a source to replace'; end if;
    insert into public.data_sources(project_id, type, name, mapping) values(p_project, p_type, p_name, p_mapping) returning id into v_source;
  end if;
  if p_mode = 'replace' then delete from public.cost_items where project_id = p_project and source_id = v_source; end if;
  insert into public.cost_items(project_id, source_id, item, grp, category, estimated, actual, currency, date, notes, source_ref, confidence)
    select p_project, v_source, public.import_literal(item), public.import_literal("group"), public.import_literal(category), estimated, actual, currency, date::date, public.import_literal(notes), public.import_literal("sourceRef"), confidence
    from jsonb_to_recordset(p_rows) as r(item text, "group" text, category text, estimated numeric, actual numeric, currency text, date text, notes text, "sourceRef" text, confidence real);
  update public.data_sources set mapping = p_mapping, status = 'ready', last_imported_at = now() where id = v_source and project_id = p_project;
  if p_template_name is not null then
    if char_length(btrim(p_template_name)) not between 1 and 120 then raise exception 'Invalid template name'; end if;
    insert into public.mapping_templates(owner_id, source_type, name, mapping) values(auth.uid(), p_type, p_template_name, p_mapping);
  end if;
  return jsonb_build_object('sourceId', v_source, 'count', v_count);
end;
$$;
revoke all on function public.commit_cost_import(uuid,uuid,text,text,jsonb,text,jsonb,text) from public, anon;
grant execute on function public.commit_cost_import(uuid,uuid,text,text,jsonb,text,jsonb,text) to authenticated;$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0004','import_commit');
 end if;
end $costlens_bundle$;

-- 0005_ai_foundation.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0005') then
  execute $costlens_ddl$-- Legacy unscoped rows stay server-only and are ignored by the gateway.
alter table public.ai_cache add column user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_cache add column project_id uuid references public.projects(id) on delete cascade;
create index ai_cache_user_created_idx on public.ai_cache(user_id,created_at);
create index ai_cache_project_idx on public.ai_cache(project_id);
create table public.ai_usage (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.projects(id) on delete set null,
 task text not null check(task in ('mapping','extraction','summary','anomaly','test')),
 model text not null,
 input_tokens integer not null default 0 check(input_tokens>=0),
 output_tokens integer not null default 0 check(output_tokens>=0),
 latency_ms integer not null default 0 check(latency_ms>=0),
 cached boolean not null default false,
 success boolean not null default true,
 created_at timestamptz not null default now()
);
create index ai_usage_user_created_idx on public.ai_usage(user_id,created_at desc);
create index ai_usage_project_idx on public.ai_usage(project_id);
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.ai_usage from public,anon,authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
create table public.user_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mask_personal_data boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy user_preferences_owner on public.user_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.user_preferences from public,anon;
grant select,insert,update,delete on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
-- ai_cache remains server-only; no client policy or client privilege is added.$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0005','ai_foundation');
 end if;
end $costlens_bundle$;

-- 0006_media_jobs.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0006') then
  execute $costlens_ddl$create table public.jobs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 source_id uuid references public.data_sources(id) on delete set null,
 type text not null check(type in ('audio','video')),
 status text not null default 'queued' check(status in ('queued','processing','needs_review','failed','done')),
 progress integer not null default 0 check(progress between 0 and 100),
 error text check(char_length(error)<=1000), result jsonb,
 storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 200),
 mime_type text not null, expected_size bigint not null check(expected_size between 1 and 524288000),
 upload_complete boolean not null default false, consent_transcription boolean not null default false,
 duration real check(duration>0 and duration<=1800), file_hash text check(file_hash ~ '^[a-f0-9]{64}$'),
 cleanup_pending boolean not null default true, committed_count integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 check(storage_path ~ ('^'||project_id::text||'/'||id::text||'\.(mp3|wav|m4a|ogg|mp4|mov|webm)$'))
);
create index jobs_project_created_idx on public.jobs(project_id,created_at desc);
create index jobs_queue_idx on public.jobs(status,updated_at) where status in ('queued','processing');
alter table public.jobs enable row level security;
alter table public.jobs replica identity full;
create policy jobs_read_owner on public.jobs for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on public.jobs from public,anon,authenticated;
grant select on public.jobs to authenticated;
grant all on public.jobs to service_role;
create function public.touch_media_job() returns trigger language plpgsql set search_path=public,pg_temp as $$begin new.updated_at=now();if new.status=old.status then new.progress=greatest(old.progress,new.progress);end if;return new;end;$$;
create trigger jobs_updated before update on public.jobs for each row execute function public.touch_media_job();
create function public.claim_media_job(p_job uuid) returns setof public.jobs language sql security definer set search_path=public,pg_temp as $$
 update public.jobs set status='processing',progress=5,error=null where id=p_job and status='queued' and upload_complete and consent_transcription and expires_at>now() returning *;
$$;
revoke all on function public.claim_media_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_media_job(uuid) to service_role;
-- A single transaction prevents duplicate imports when the final request is retried.
create function public.commit_media_import(p_job uuid,p_project uuid,p_mapping jsonb,p_rows jsonb,p_template_name text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.jobs; v_result jsonb;
begin
 select * into j from public.jobs where id=p_job and project_id=p_project for update;
 if j.id is null or not exists(select 1 from public.projects where id=j.project_id and owner_id=auth.uid()) then raise exception 'Project not found' using errcode='42501';end if;
 if j.status='done' then return jsonb_build_object('sourceId',j.source_id,'jobId',j.id,'count',j.committed_count);end if;
 if j.status<>'needs_review' or j.source_id is null then raise exception 'Recording is not ready for review';end if;
 v_result=public.commit_cost_import(j.project_id,j.source_id,j.type,j.file_name,p_mapping||jsonb_build_object('fileHash',j.file_hash),'append',p_rows,p_template_name);
 update public.jobs set status='done',progress=100,result=null,committed_count=(v_result->>'count')::integer,cleanup_pending=true where id=j.id;
 return v_result||jsonb_build_object('jobId',j.id);
end;$$;
revoke all on function public.commit_media_import(uuid,uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.commit_media_import(uuid,uuid,jsonb,jsonb,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('media-uploads','media-uploads',false,524288000,array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','application/ogg','video/mp4','video/quicktime','video/webm','audio/webm'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Signed upload tokens cannot be revoked individually. Enforce the reservation
-- at INSERT too, so a still-valid token cannot recreate a confirmed/deleted file.
create function public.guard_media_object_insert() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.bucket_id='media-uploads' and not exists(select 1 from public.jobs j where j.storage_path=new.name and j.status='queued' and not j.upload_complete and j.expires_at>now()) then raise exception 'Media upload reservation is closed' using errcode='42501';end if;
 return new;
end;$$;
create trigger media_upload_reservation before insert on storage.objects for each row execute function public.guard_media_object_insert();
create policy media_read_owner on storage.objects for select to authenticated using(bucket_id='media-uploads' and exists(select 1 from public.jobs j join public.projects p on p.id=j.project_id where j.storage_path=storage.objects.name and p.owner_id=auth.uid() and j.status<>'done' and j.expires_at>now()));
create policy media_upload_owner on storage.objects for insert to authenticated with check(bucket_id='media-uploads' and exists(select 1 from public.jobs j join public.projects p on p.id=j.project_id where j.storage_path=storage.objects.name and p.owner_id=auth.uid() and not j.upload_complete and j.expires_at>now()));
create policy media_delete_owner on storage.objects for delete to authenticated using(bucket_id='media-uploads' and exists(select 1 from public.jobs j join public.projects p on p.id=j.project_id where j.storage_path=storage.objects.name and p.owner_id=auth.uid()));
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.jobs;end if;end;$$;$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0006','media_jobs');
 end if;
end $costlens_bundle$;

-- 0007_insight_cache_invalidation.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0007') then
  execute $costlens_ddl$-- Statement transition tables invalidate each affected project once, including
-- bulk imports. Data fingerprints also protect against concurrent stale writes.
create function public.invalidate_cost_insights() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' then
  delete from public.ai_cache where kind='summary' and project_id in (select project_id from old_cost_rows union select project_id from new_cost_rows);
 else
  delete from public.ai_cache where kind='summary' and project_id in (select distinct project_id from changed_cost_rows);
 end if;
 return null;
end;$$;
create trigger cost_insights_insert after insert on public.cost_items referencing new table as changed_cost_rows for each statement execute function public.invalidate_cost_insights();
create trigger cost_insights_delete after delete on public.cost_items referencing old table as changed_cost_rows for each statement execute function public.invalidate_cost_insights();
create trigger cost_insights_update after update on public.cost_items referencing old table as old_cost_rows new table as new_cost_rows for each statement execute function public.invalidate_cost_insights();$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0007','insight_cache_invalidation');
 end if;
end $costlens_bundle$;

-- 0008_public_demo.sql
do $costlens_bundle$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='0008') then
  execute $costlens_ddl$-- Read the authoritative account flag: an old JWT cannot bypass newly enabled demo protection.
create function public.costlens_demo_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select raw_app_meta_data->>'costlens_demo' = 'true' from auth.users where id = auth.uid()), false);
$$;
revoke all on function public.costlens_demo_user() from public;
grant execute on function public.costlens_demo_user() to authenticated, service_role;

-- Restrictive write policies combine with, rather than replace, the existing owner policies.
do $$
declare t text;
begin
 foreach t in array array['projects','data_sources','cost_items','mapping_templates','ai_cache','ai_usage','user_preferences','jobs'] loop
  execute format('create policy demo_no_insert on public.%I as restrictive for insert to authenticated with check (not public.costlens_demo_user())',t);
  execute format('create policy demo_no_update on public.%I as restrictive for update to authenticated using (not public.costlens_demo_user()) with check (not public.costlens_demo_user())',t);
  execute format('create policy demo_no_delete on public.%I as restrictive for delete to authenticated using (not public.costlens_demo_user())',t);
 end loop;
end $$;
create policy demo_no_insert on storage.objects as restrictive for insert to authenticated with check (not public.costlens_demo_user());
create policy demo_no_update on storage.objects as restrictive for update to authenticated using (not public.costlens_demo_user()) with check (not public.costlens_demo_user());
create policy demo_no_delete on storage.objects as restrictive for delete to authenticated using (not public.costlens_demo_user());

-- Public visitors must not take over the shared account through the direct Auth API.
create function public.lock_demo_credentials() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if old.raw_app_meta_data->>'costlens_demo' = 'true' and
  (new.email is distinct from old.email or new.encrypted_password is distinct from old.encrypted_password
   or new.phone is distinct from old.phone or new.email_change is distinct from old.email_change
   or new.phone_change is distinct from old.phone_change) then
  raise exception 'Public demo credentials cannot be changed' using errcode='42501';
 end if;
 return new;
end $$;
create trigger costlens_lock_demo_credentials before update on auth.users for each row execute function public.lock_demo_credentials();
revoke all on function public.lock_demo_credentials() from public, anon, authenticated;

-- An administrator can inspect real policy state without a browser-accessible SQL endpoint.
create function public.production_security_status() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'policies',(select count(*) from pg_policy p where p.polrelid=c.oid)) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))),
  'mediaBucketPrivate',coalesce((select not public from storage.buckets where id='media-uploads'),false),
  'demoProtection',(select count(*)=27 from pg_policy where polname in ('demo_no_insert','demo_no_update','demo_no_delete') and polrelid in
   ('public.projects'::regclass,'public.data_sources'::regclass,'public.cost_items'::regclass,'public.mapping_templates'::regclass,'public.ai_cache'::regclass,'public.ai_usage'::regclass,'public.user_preferences'::regclass,'public.jobs'::regclass,'storage.objects'::regclass))
   and exists(select 1 from pg_trigger where tgname='costlens_lock_demo_credentials' and not tgisinternal)
 );
$$;
revoke all on function public.production_security_status() from public, anon, authenticated;
grant execute on function public.production_security_status() to service_role;$costlens_ddl$;
  insert into supabase_migrations.schema_migrations(version,name) values('0008','public_demo');
 end if;
end $costlens_bundle$;

-- Save these results as production evidence after running the bundle.
select * from public.production_security_status();
select version,name from supabase_migrations.schema_migrations order by version;
