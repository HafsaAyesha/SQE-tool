import type { CostRow } from '@/lib/import/schema';
export type { CostRow } from '@/lib/import/schema';
export type CostTableRow = CostRow & {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  type: string;
};
