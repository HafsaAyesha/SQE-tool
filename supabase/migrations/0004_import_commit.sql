begin;
alter table public.mapping_templates add column if not exists created_at timestamptz not null default now();
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
grant execute on function public.commit_cost_import(uuid,uuid,text,text,jsonb,text,jsonb,text) to authenticated;
commit;
