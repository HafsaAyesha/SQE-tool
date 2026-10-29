begin;
-- Statement transition tables invalidate each affected project once, including
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
create trigger cost_insights_update after update on public.cost_items referencing old table as old_cost_rows new table as new_cost_rows for each statement execute function public.invalidate_cost_insights();
commit;
