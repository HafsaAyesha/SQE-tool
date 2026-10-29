import { z } from 'zod';
export const aiTestSchema=z.object({ok:z.literal(true),message:z.string().min(1).max(120)}).strict();
export const AI_TEST_SYSTEM='Confirm that the CostLens AI connection works. Return ok=true and a short neutral confirmation message. Do not repeat the input.';
export const AI_TEST_CONTENT='CostLens connection check.';
