import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), login: vi.fn(), signup: vi.fn(), signout: vi.fn() }));
vi.mock('@/lib/supabase/config', () => ({ getSupabaseConfig: mocks.config }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.login, signUp: mocks.signup, signOut: mocks.signout } }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { authenticate, signOut } from '@/app/(auth)/actions';
const input = { email: 'user@example.com', password: 'test-password-123' };
beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({}); });
describe('server authentication actions', () => {
  it('rejects malformed inputs and unknown modes on the server', async () => {
    expect((await authenticate('login', { ...input, password: 'short' })).error).toBeTruthy();
    expect((await authenticate('invalid', input)).error).toBeTruthy();
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('reports missing configuration without contacting Supabase', async () => {
    mocks.config.mockReturnValue(null);
    expect((await authenticate('login', input)).error).toContain('not configured');
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('redirects to projects after a successful login', async () => {
    mocks.login.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null });
    await expect(authenticate('login', input)).rejects.toThrow('REDIRECT:/projects');
    expect(mocks.login).toHaveBeenCalledWith(input);
  });
  it('explains email confirmation when signup returns no session', async () => {
    mocks.signup.mockResolvedValue({ data: { session: null }, error: null });
    expect((await authenticate('signup', input)).message).toContain('Check your email');
  });
  it('redirects after signup when email confirmation is disabled', async () => {
    mocks.signup.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(authenticate('signup', input)).rejects.toThrow('REDIRECT:/projects');
  });
  it('shows a generic error without exposing provider details', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.login.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', status: 400, message: 'internal provider detail' } });
    const result = await authenticate('login', input);
    expect(result.error).toContain('Unable to sign in');
    expect(result.error).not.toContain('internal provider detail');
    logger.mockRestore();
  });
  it('signs out and redirects to login', async () => {
    mocks.signout.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow('REDIRECT:/login');
    expect(mocks.signout).toHaveBeenCalled();
  });
  it('does not claim sign-out succeeded when the provider fails', async () => {
    mocks.signout.mockResolvedValue({ error: { message: 'network' } });
    expect((await signOut()).error).toBeTruthy();
  });
});
