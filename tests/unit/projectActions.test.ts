import { cleanupProjectMedia } from '@/lib/media/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/security/rateLimit',()=>({enforceRateLimit:vi.fn(async()=>{}),RateLimitError:class extends Error{},RateLimitUnavailableError:class extends Error{}}));
vi.mock('@/lib/media/server',()=>({cleanupProjectMedia:vi.fn(async()=>{})}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn(), requireProject: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mocks.from, auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/requireProject', () => ({ requireProject: mocks.requireProject }));
import { createProject, renameProject, deleteProject, saveCostItem, deleteCostItem } from '@/app/(app)/projects/actions';
const projectId = '33333333-3333-4333-8333-333333333333';
const rowId = '44444444-4444-4444-8444-444444444444';
const valid = { item: 'Cloud', group: 'Build', category: 'Cloud', estimated: 100, actual: 80, date: null, notes: null };
beforeEach(() => {
  vi.clearAllMocks();
  const query = { insert: mocks.insert, update: mocks.update, delete: mocks.delete, eq: mocks.eq, select: mocks.select, single: mocks.single, maybeSingle: mocks.maybeSingle };
  for (const mock of [mocks.from, mocks.insert, mocks.update, mocks.delete, mocks.eq, mocks.select]) mock.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { id: projectId }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { id: rowId }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-owner' } }, error: null });
  mocks.requireProject.mockResolvedValue({ id: projectId, owner_id: 'real-owner', currency: 'PKR' });
});
describe('project mutation boundaries', () => {
  it('creates projects using verified ownership rather than caller ownership', async () => {
    expect(await createProject({ name: 'Demo', currency: 'USD', owner_id: 'forged' })).toMatchObject({ success: true });
    expect(mocks.insert).toHaveBeenCalledWith({ name: 'Demo', currency: 'USD', owner_id: 'real-owner' });
  });
  it('requires project ownership and fixes manual source/currency on insertion', async () => {
    await saveCostItem(projectId, null, { ...valid, source_id: 'forged', currency: 'USD' });
    expect(mocks.requireProject).toHaveBeenCalledWith(projectId);
    expect(mocks.insert).toHaveBeenCalledWith({ item: 'Cloud', grp: 'Build', category: 'Cloud', estimated: 100, actual: 80, date: null, notes: null, project_id: projectId, source_id: null, currency: 'PKR' });
  });
  it('scopes row edits to both IDs and preserves imported provenance', async () => {
    await saveCostItem(projectId, rowId, { ...valid, source_id: null, currency: 'USD', project_id: 'forged' });
    expect(mocks.eq).toHaveBeenCalledWith('id', rowId);
    expect(mocks.eq).toHaveBeenCalledWith('project_id', projectId);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('source_id');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('currency');
  });
  it('guards rename, project delete, and row delete and filters mutations', async () => {
    await renameProject(projectId, { name: 'Renamed', currency: 'USD' });
    await deleteProject(projectId);
    await deleteCostItem(projectId, rowId);
    expect(mocks.requireProject).toHaveBeenCalledTimes(3);
    expect(mocks.eq).toHaveBeenCalledWith('owner_id', 'real-owner');
    expect(mocks.eq).toHaveBeenCalledWith('project_id', projectId);
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Renamed' });
  });
  it('rejects invalid values and row IDs without mutating records', async () => {
    expect((await saveCostItem(projectId, null, { ...valid, actual: -1 })).error).toBeTruthy();
    expect((await saveCostItem(projectId, 'bad', valid)).error).toBeTruthy();
    expect((await deleteCostItem(projectId, 'bad')).error).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([
    ['negative actual', { actual: -1 }, 'Amounts cannot be negative.'],
    ['negative estimate', { estimated: -1 }, 'Amounts cannot be negative.'],
    ['empty item', { item: '' }, 'Enter an item name.'],
    ['whitespace item', { item: '   ' }, 'Enter an item name.'],
    ['10,000-character note', { notes: 'x'.repeat(10000) }, 'Use at most 2000 characters.'],
  ])('direct server action rejects %s on both insert and update', async (_label, patch, message) => {
    for (const id of [null, rowId]) {
      const result = await saveCostItem(projectId, id, { ...valid, ...patch });
      expect(result.error).toBe(message);
      expect(result.success).toBeUndefined();
    }
    expect(mocks.requireProject).toHaveBeenCalledTimes(2);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not mutate projects rejected by requireProject', async () => {
    mocks.requireProject.mockRejectedValue(Object.assign(new Error('404'),{digest:'NEXT_HTTP_ERROR_FALLBACK;404'}));
    await expect(saveCostItem(projectId, null, valid)).rejects.toThrow('404');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

it('preserves a project if private media cleanup fails',async()=>{
  vi.mocked(cleanupProjectMedia).mockRejectedValueOnce(new Error('Storage unavailable'));
  const result=await deleteProject('11111111-1111-4111-8111-111111111111');expect(result.error).toContain('Private recordings');expect(mocks.delete).not.toHaveBeenCalled();
});
