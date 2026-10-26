import { z } from 'zod';
export const authSchema = z.object({ email: z.string().trim().email('Enter a valid email address.').max(254), password: z.string().min(10, 'Use at least 10 characters.').max(128, 'Use at most 128 characters.') });
export type AuthInput = z.infer<typeof authSchema>;
