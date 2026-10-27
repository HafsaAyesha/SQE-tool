import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), returns: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mocks.from }) }));
import { loadCostItems } from '@/lib/projects/data';
beforeEach(() => {
  vi.clearAllMocks();
  const query = { ...mocks };
  for (const mock of [mocks.from, mocks.select, mocks.eq, mocks.order, mocks.range]) mock.mockReturnValue(query);
});
it('fetches all batches even when the backend row cap is smaller than the requested range', async () => {
  const raw = (id: string) => ({ id, item: id, grp: null, category: null, estimated: null, actual: 0, currency: 'USD', date: null, notes: null, source_ref: null, confidence: null, source_id: null, source: null });
  mocks.returns.mockResolvedValueOnce({ data: [raw('a'), raw('b')], error: null }).mockResolvedValueOnce({ data: [raw('c')], error: null }).mockResolvedValueOnce({ data: [], error: null });
  const rows = await loadCostItems('project-id');
  expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c']);
  expect(rows.every(row => row.type === 'manual' && row.sourceId === null && row.actual === 0)).toBe(true);
  expect(mocks.range.mock.calls).toEqual([[0, 999], [2, 1001], [3, 1002]]);
  expect(mocks.eq).toHaveBeenCalledWith('project_id', 'project-id');
});
