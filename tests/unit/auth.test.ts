import { describe, expect, it } from 'vitest';
import { authSchema } from '@/lib/auth/schema';
describe('authentication input validation', () => {
  it('requires a valid email and 10–128 password characters', () => {
    expect(authSchema.safeParse({ email: ' user@example.com ', password: '1234567890' }).success).toBe(true);
    for (const input of [{ email: 'invalid', password: '1234567890' }, { email: 'user@example.com', password: '123456789' }, { email: 'user@example.com', password: 'x'.repeat(129) }]) expect(authSchema.safeParse(input).success).toBe(false);
  });
});
