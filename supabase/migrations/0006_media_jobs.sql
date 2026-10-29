begin;
create table public.jobs (
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
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.jobs;end if;end;$$;
commit;
