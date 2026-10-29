import { z } from 'zod';
import { cumulativeByDate, summarise, summaryKey, totals, type SummaryBy } from './calc';
import type { CostTableRow } from './types';
export const groupings = ['group', 'category', 'source', 'month'] as const;
const date = z.string().date();
const queryFields = {
  anomalies:z.literal('1'), by: z.enum(groupings), source: z.union([z.string().uuid(), z.literal('manual')]),
  category: z.string().min(1).max(80), group: z.string().min(1).max(120),
  from: date, to: date, q: z.string().min(1).max(200), focus: z.string().min(1).max(256),
};
export type DashboardFilters = { by: SummaryBy; anomalies?:'1'; source?: string; category?: string; group?: string; from?: string; to?: string; q?: string; focus?: string };
/** Invalid query values are ignored explicitly, never used in a database query. */
export function readDashboardFilters(query: URLSearchParams) {
  const filters: DashboardFilters = { by: 'category' }; const invalid: string[] = [];
  for (const key of Object.keys(queryFields) as (keyof typeof queryFields)[]) {
    const value = query.get(key); if (!value) continue;
    const parsed = queryFields[key].safeParse(value);
    if (!parsed.success) { invalid.push(key); continue; }
    if (key === 'by') filters.by = parsed.data as SummaryBy;
    else if(key==='anomalies')filters.anomalies='1';
    else filters[key] = parsed.data;
  }
  if (filters.from && filters.to && filters.from > filters.to) { delete filters.from; delete filters.to; invalid.push('date range'); }
  return { filters, invalid };
}
export function updateDashboardQuery(current: URLSearchParams, changes: Partial<Record<keyof DashboardFilters, string | undefined>>) {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
  return next;
}
export function filterDashboardRows(rows: readonly CostTableRow[], filters: DashboardFilters) {
  const search = filters.q?.trim().toLocaleLowerCase('en');
  return rows.filter(row => (!filters.source || (filters.source === 'manual' ? row.sourceId === null : row.sourceId === filters.source))
    && (!filters.category || row.category === filters.category) && (!filters.group || row.group === filters.group)
    && (!filters.from || (row.date !== null && row.date >= filters.from)) && (!filters.to || (row.date !== null && row.date <= filters.to))
    && (!search || row.item.toLocaleLowerCase('en').includes(search)));
}
export type BurnSeries = { key: string; label: string; points: ReturnType<typeof cumulativeByDate> };
/** Keep lines readable; combine overflow keys without dropping their amounts. */
export function burnSeries(rows: readonly CostTableRow[], by: SummaryBy, label: (key: string) => string, maxGroups = 4): BurnSeries[] {
  const ranked = summarise(rows, by).sort((a, b) => b.actual - a.actual || a.key.localeCompare(b.key, 'en'));
  const visible = ranked.slice(0, maxGroups); const visibleKeys = new Set(visible.map(group => group.key));
  const result = visible.map(group => ({ key: group.key, label: label(group.key), points: cumulativeByDate(rows.filter(row => summaryKey(row, by) === group.key)) }));
  let remainingKey='__remaining_groups__';while(ranked.some(group=>group.key===remainingKey))remainingKey+='_';
  if (ranked.length > maxGroups) result.push({ key: remainingKey, label: `Other ${ranked.length - maxGroups} ${by === 'category' ? 'categories' : 'groups'}`, points: cumulativeByDate(rows.filter(row => !visibleKeys.has(summaryKey(row, by)))) });
  return result.filter(series => series.points.length > 0);
}
export function alignBurnSeries(series: readonly BurnSeries[]) {
  const dates = [...new Set(series.flatMap(group => group.points.map(point => point.date)))].sort();
  const positions = series.map(() => 0);
  const latest = series.map(() => ({ cumEstimated: 0, cumActual: 0 }));
  return dates.map(date => {
    const point: Record<string, number | string> = { date };
    series.forEach((group, index) => {
      while (positions[index] < group.points.length && group.points[positions[index]].date <= date) latest[index] = group.points[positions[index]++];
      point[`s${index}Estimated`] = latest[index].cumEstimated; point[`s${index}Actual`] = latest[index].cumActual;
    });
    return point;
  });
}
export function dashboardModel(rows: readonly CostTableRow[], currency: string, filters: DashboardFilters) {
  const filtered = filterDashboardRows(rows, filters);
  const monetaryRows = filtered.filter(row => row.currency === currency);
  const summaries = summarise(monetaryRows, filters.by);
  const positiveKeys = new Set(summaries.filter(group => group.actual > 0).map(group => group.key));
  return {
    rows: filtered, tableRows: filters.focus ? filtered.filter(row => summaryKey(row, filters.by) === filters.focus) : filtered,
    monetaryRows, totals: totals(monetaryRows), summaries,
    shareTotal: totals(monetaryRows.filter(row => positiveKeys.has(summaryKey(row, filters.by)))).actual,
    otherCurrencyCount: filtered.length - monetaryRows.length,
  };
}
