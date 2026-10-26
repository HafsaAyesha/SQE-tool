begin;

create table public.projects (
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
grant all on public.projects, public.data_sources, public.cost_items, public.mapping_templates, public.ai_cache to service_role;
commit;
