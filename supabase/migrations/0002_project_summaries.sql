begin;
-- security_invoker applies the caller's RLS to both projects and cost_items.
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
revoke all on public.project_summaries from anon;
commit;
