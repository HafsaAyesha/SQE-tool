import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), from: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); } }));
import { requireProject } from '@/lib/supabase/requireProject';
const id = '33333333-3333-4333-8333-333333333333';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { id, owner_id: 'owner' }, error: null });
});
describe('requireProject access guard', () => {
  it('validates IDs before querying', async () => {
    await expect(requireProject('bad')).rejects.toThrow('404');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('uses a verified user and filters by both id and owner', async () => {
    await expect(requireProject(id)).resolves.toMatchObject({ id });
    expect(mocks.eq).toHaveBeenCalledWith('id', id);
    expect(mocks.eq).toHaveBeenCalledWith('owner_id', 'owner');
  });
  it('returns 404 to signed-out users', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireProject(id)).rejects.toThrow('404');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns 404 for nonexistent or inaccessible projects', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requireProject(id)).rejects.toThrow('404');
  });
});
