import { rowVariance, rowVariancePct, status } from './calc';
import type { CostTableRow } from './types';
export const PAGE_SIZE = 50;
export type SortColumn = 'item' | 'group' | 'category' | 'estimated' | 'actual' | 'variance' | 'percentVariance' | 'date' | 'source' | 'status';
export type TableFilters = { search: string; group: string; category: string; sort: SortColumn; direction: 'asc' | 'desc' };
export function selectRows(rows: CostTableRow[], filters: TableFilters) {
  const search = filters.search.trim().toLocaleLowerCase('en');
  return rows.filter(row => row.item.toLocaleLowerCase('en').includes(search) && (!filters.group || row.group === filters.group) && (!filters.category || row.category === filters.category))
    .sort((a, b) => {
      function value(row: CostTableRow): string | number | null {
        if (filters.sort === 'variance') return rowVariance(row);
        if (filters.sort === 'percentVariance') return rowVariancePct(row);
        if (filters.sort === 'status') return status(row);
        if (filters.sort === 'source') return row.sourceName ?? (row.type === 'manual' ? 'Manual' : row.type);
        return row[filters.sort];
      }
      const left = value(a), right = value(b);
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true });
      return comparison * (filters.direction === 'asc' ? 1 : -1);
    });
}
export function budgetProgress(estimated: number, actual: number) {
  return { percent: estimated > 0 ? Math.min(100, actual / estimated * 100) : actual > 0 ? 100 : 0, over: actual > estimated };
}
