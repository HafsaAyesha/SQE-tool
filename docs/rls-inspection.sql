-- Run as a database administrator (e.g. in the Supabase SQL Editor).
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('projects', 'data_sources', 'cost_items', 'mapping_templates', 'ai_cache')
order by tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'data_sources', 'cost_items', 'mapping_templates', 'ai_cache')
order by tablename, policyname;
