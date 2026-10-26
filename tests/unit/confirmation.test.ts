import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/supabase/config', () => ({ getSupabaseConfig: mocks.config }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }) }));
import { GET } from '@/app/auth/confirm/route';
beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({}); });
it('verifies a confirmation token and sends the user to projects', async () => {
  mocks.verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(new NextRequest('http://localhost/auth/confirm?token_hash=test-token&type=email&next=https://example.org'));
  expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'test-token', type: 'email' });
  expect(response.headers.get('location')).toBe('http://localhost/projects');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('rejects invalid token parameters before contacting the provider', async () => {
  const response = await GET(new NextRequest('http://localhost/auth/confirm?type=recovery'));
  expect(response.headers.get('location')).toBe('http://localhost/login?confirmation=failed');
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
});
it('handles expired tokens without exposing provider errors', async () => {
  mocks.verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
  const response = await GET(new NextRequest('http://localhost/auth/confirm?token_hash=expired&type=email'));
  expect(response.headers.get('location')).toBe('http://localhost/login?confirmation=failed');
});
