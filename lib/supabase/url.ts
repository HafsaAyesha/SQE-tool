// Supabase clients append /auth/v1 and /rest/v1 themselves, so only the project origin is valid here.
// Common paste mistakes (a /rest/v1 suffix, the dashboard link) otherwise surface as bare 404s from Auth.
export function normalizeSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  const dashboard = url.hostname === 'supabase.com' && /^\/dashboard\/project\/([a-z0-9]{20})(\/|$)/.exec(url.pathname);
  if (dashboard) return `https://${dashboard[1]}.supabase.co`;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.origin;
}
