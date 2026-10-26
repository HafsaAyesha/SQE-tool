'use client';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config';
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase configuration is missing');
  return createBrowserClient(config.url, config.anonKey);
}
