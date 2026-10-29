begin;
-- Read the authoritative account flag: an old JWT cannot bypass newly enabled demo protection.
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
grant execute on function public.production_security_status() to service_role;
commit;
