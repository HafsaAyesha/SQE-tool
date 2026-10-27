import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

// No mocks: assertions use the public anon key and independent signed-in clients.
// The service-role key is restricted to creating and deleting this run's test users.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const required = process.env.COSTLENS_REQUIRE_LIVE_RLS === '1';
const configured = Boolean(url && anonKey && serviceKey);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const createdUsers: string[] = [];
let admin: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let projectId: string;
let ownerId: string;
function checkError(operation: string, error: { code?: string; status?: number } | null) {
  if (error) throw new Error(`${operation} failed (${error.code ?? error.status ?? 'unknown'}). Check Supabase access, keys, and migration state.`);
}

describe.skipIf(!configured && !required).sequential('live Supabase RLS with two signed-in anon-key clients', () => {
  beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error('Live RLS requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Set them securely; never paste keys into chat.');
    admin = createClient(url, serviceKey, options);
    clientA = createClient(url, anonKey, options);
    clientB = createClient(url, anonKey, options);
    const run = randomUUID();
    for (const [label, client] of [['a', clientA], ['b', clientB]] as const) {
      const email = `costlens-rls-${run}-${label}@example.com`;
      const password = randomBytes(32).toString('base64url');
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      checkError(`Create test user ${label.toUpperCase()}`, createError);
      if (!created.user) throw new Error('Test user creation returned no user');
      createdUsers.push(created.user.id);
      if (label === 'a') ownerId = created.user.id;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      checkError(`Sign in test user ${label.toUpperCase()}`, error);
      expect(data.user?.id).toBe(created.user.id);
    }
    const { data, error } = await clientA.from('projects').insert({ owner_id: ownerId, name: `RLS validation ${run}`, currency: 'USD' }).select('id').single();
    checkError('Create A’s project through anon-key client', error);
    expect(data?.id).toBeTruthy();
    projectId = data!.id;
  }, 60000);

  afterAll(async () => {
    if (!admin) return;
    const errors: string[] = [];
    // auth.users -> projects -> cost_items/data_sources cascades remove only our fixtures.
    for (const id of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) errors.push(`Could not remove test user ${id} (${error.code ?? error.status})`);
    }
    if (errors.length) throw new Error(errors.join('; '));
  }, 30000);

  it('A can select their own project (positive access control)', async () => {
    const { data, error } = await clientA.from('projects').select('id, owner_id').eq('id', projectId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: projectId, owner_id: ownerId }]);
  });
  it('B selecting A’s project returns zero rows without an error', async () => {
    const { data, error } = await clientB.from('projects').select('id').eq('id', projectId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  it('A can insert a cost item into their own project', async () => {
    const { data, error } = await clientA.from('cost_items').insert({ project_id: projectId, item: 'Owner control', actual: 12.5, currency: 'USD' }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });
  it('B inserting a cost item into A’s project is rejected by RLS', async () => {
    const { data, error } = await clientB.from('cost_items').insert({ project_id: projectId, item: 'Unauthorized insertion', actual: 99, currency: 'USD' }).select('id');
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/row.level security/i);
    const { data: existing, error: queryError } = await clientA.from('cost_items').select('id').eq('project_id', projectId).eq('item', 'Unauthorized insertion');
    expect(queryError).toBeNull();
    expect(existing).toEqual([]);
  });
  it('summary totals include more than 1000 costs and stay invisible to B', async () => {
    const { error: insertError } = await clientA.from('cost_items').insert(Array.from({ length: 1005 }, (_, i) => ({ project_id: projectId, item: `Summary fixture ${i}`, estimated: 2, actual: 1, currency: 'USD', source_id: null })));
    expect(insertError).toBeNull();
    const { data, error } = await clientA.from('project_summaries').select('item_count,total_estimated,total_actual').eq('id', projectId).single();
    expect(error).toBeNull();
    expect(data?.item_count).toBe(1006);
    expect(Number(data?.total_estimated)).toBe(2010);
    expect(Number(data?.total_actual)).toBe(1017.5);
    const other = await clientB.from('project_summaries').select('id').eq('id', projectId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  }, 15000);

});
