import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSupabaseUrl } from '@/lib/supabase/url';
import { getSupabaseConfig } from '@/lib/supabase/config';
const ref = 'abcdefghijklmnopqrst';
afterEach(() => vi.unstubAllEnvs());
describe('Supabase URL normalization', () => {
  it('keeps a correct project origin', () => {
    expect(normalizeSupabaseUrl(`https://${ref}.supabase.co`)).toBe(`https://${ref}.supabase.co`);
    expect(normalizeSupabaseUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
  });
  it('strips API paths, trailing slashes and whitespace that make Auth return 404', () => {
    for (const value of [`https://${ref}.supabase.co/`, `https://${ref}.supabase.co/rest/v1/`, `https://${ref}.supabase.co/auth/v1`, ` https://${ref}.supabase.co\n`])
      expect(normalizeSupabaseUrl(value)).toBe(`https://${ref}.supabase.co`);
  });
  it('recovers the project origin from a dashboard link', () => {
    expect(normalizeSupabaseUrl(`https://supabase.com/dashboard/project/${ref}/settings/api`)).toBe(`https://${ref}.supabase.co`);
  });
  it('rejects missing or non-HTTP values', () => {
    for (const value of [undefined, '', 'not a url', 'postgresql://postgres@db.example.supabase.co:5432/postgres']) expect(normalizeSupabaseUrl(value)).toBeNull();
  });
  it('feeds the normalized origin to the Supabase clients', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${ref}.supabase.co/rest/v1/`);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ' public-test-key ');
    expect(getSupabaseConfig()).toEqual({ url: `https://${ref}.supabase.co`, anonKey: 'public-test-key' });
  });
});
