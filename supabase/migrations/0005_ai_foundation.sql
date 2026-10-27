begin;
-- Legacy unscoped rows stay server-only and are ignored by the gateway.
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
-- ai_cache remains server-only; no client policy or client privilege is added.
commit;
