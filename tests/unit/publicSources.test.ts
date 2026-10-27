import { describe, expect, it } from 'vitest';
import { getAdapter } from '@/lib/import/registry';
import { rawTableSchema } from '@/lib/import/schema';
// Explicit real-network checks; ordinary tests stay deterministic/offline.
describe.skipIf(process.env.COSTLENS_LIVE_ONLINE !== '1')('real public online sources', () => {
  it.each([
    ['gsheets', 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'],
    ['url', 'https://jsonplaceholder.typicode.com/todos'],
    ['html', 'https://www.w3.org/WAI/tutorials/tables/one-header/'],
  ])('fetches %s using the real DNS/IP-pinned guard', async (id, url) => {
    const table = await getAdapter(id)!.parse(url);
    expect(rawTableSchema.safeParse(table).success).toBe(true);
    expect(table.rows.length).toBeGreaterThan(0);
    expect(table.columns.length).toBeGreaterThan(1);
    console.info(`${id}: ${table.rows.length} rows, ${table.columns.length} columns`);
  }, 15000);
});
