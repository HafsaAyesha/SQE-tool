# Step 4A status

Production deployment is prepared but **not complete**. The user selected a new deployment with dashboard instructions. There are no attached Vercel/Render management tools or credentials and no Supabase management token, OpenAI speech key, final app/worker URLs or demo password in this session. Production keys already configured here allowed read-only confirmation that the existing Supabase application tables are accessible; that is not proof of RLS or auth settings. No hosted schema was modified, no new production Redis/service was created, and no billing setting was changed.

## Work completed

- Added migration 0008: authoritative database demo flag, restrictive write policies that preserve normal owner RLS, credential-change protection for the shared demo account, and a service-only production RLS/Storage status RPC.
- Added the landing-page Try the demo button and an origin-checked, rate-limited server sign-in endpoint. It never returns the password and rejects incomplete/unmarked demo accounts.
- Made shared demo projects read-only in app mutations, import/media routes, direct Supabase access and the dashboard UI. Demo AI can only read validated saved summaries; misses never invoke a paid provider. Fixed synthetic demo summaries may be reused beyond the normal seven-day cache window; ordinary account behaviour is unchanged.
- Prepared a migration-history-aware SQL bundle, Render Docker blueprint, real-pipeline demo seeder, and production verifier. The seed refuses invented amounts, uses the actual worker/Whisper/Gemini path, checks post-commit recording deletion and real summary usage, locks incomplete accounts, and refuses to overwrite unmarked real accounts.
- Rewrote README with actual Gemini architecture, environment/setup/test/demo instructions. Added the ordered provider dashboard guide in docs/deployment.md. The live URL remains explicitly pending until real verification succeeds.

## Checks performed under FAST TESTING RULES

| Check | Result | Evidence |
| --- | --- | --- |
| npm run lint | PASS | ESLint zero warnings |
| npm run typecheck | PASS | Strict TypeScript, including deployment scripts |
| New/changed test files only | PASS | tests/unit/demo.test.ts: 8; tests/unit/mediaMigration.test.ts: 4; tests/unit/aiClient.test.ts: 18 — 30 focused tests total |
| Fresh migration bundle and repeat application | PASS locally | mediaMigration test uses all eight real migrations in PGlite and re-applies the generated bundle without resetting data |
| Demo read-only and credential changes | PASS locally | owner SELECT allowed; project/cost writes denied; old-JWT metadata cannot bypass protection; demo password change denied; ordinary account password change allowed |
| Demo seed dry run | PASS | npm run seed:demo -- --dry-run; no accounts, uploads, transcription or paid AI calls created |
| Generated marketing assets | PASS locally | Word parsed into three expected cost rows; receipt generated as a valid 900×1000 JPEG |
| Production deployment / seed / health / demo login | NOT RUN | Requires dashboard service creation, production configuration, OpenAI speech key and final public URLs |
| Provider monetary limits | NOT CONFIGURED | Dashboard access and chosen budget amounts are required; Gemini/OpenAI budget alerts must not be presented as hard caps |

No Playwright, full test suite or production build was run in this step. The eventual Vercel deployment performs the production build. No new test accounts or paid calls were created by the local checks; the existing migration fixture and source fixtures were reused.

## Operator configuration still needed

Follow docs/deployment.md in order. Create/choose the production Supabase project without resetting an existing database, apply tracked migrations, create production Redis, import the correct Vercel branch, deploy the Render worker, set auth URLs/email confirmation and provider budgets. The worker requires APP_URL, WORKER_SECRET and OPENAI_API_KEY; Supabase/Gemini keys remain in the app. Add the same server-only DEMO_EMAIL/DEMO_PASSWORD to Vercel and the secure seed environment. Leave DEMO_ENABLED=false until the seed succeeds.

The user can run the seed/verifier from a trusted terminal, or save the final production settings securely in this cloud environment and provide only the public Vercel/Render URLs so the assistant can finish. Cloud checks require outbound access to those new hostnames. Success writes docs/demo-seed-results.json and docs/production-verification.json; neither is fabricated in advance.

Step 4A: NOT READY for production — deployment, provider settings, real production seed and live acceptance checks remain.

## Files changed

- `.env.example`
- `README.md`
- `app/(app)/layout.tsx`
- `app/(app)/projects/[id]/import/page.tsx`
- `app/(app)/projects/[id]/page.tsx`
- `app/(app)/projects/actions.ts`
- `app/(app)/projects/page.tsx`
- `app/(app)/settings/actions.ts`
- `app/api/auth/demo/route.ts`
- `app/api/projects/[id]/import/commit/route.ts`
- `app/api/projects/[id]/import/fetch/route.ts`
- `app/api/projects/[id]/import/parse/route.ts`
- `app/api/projects/[id]/media/jobs/[jobId]/route.ts`
- `app/api/projects/[id]/media/jobs/route.ts`
- `app/api/projects/[id]/media/upload-url/route.ts`
- `app/page.tsx`
- `components/costlens/DemoButton.tsx`
- `components/costlens/InsightsPanel.tsx`
- `components/costlens/ProjectActions.tsx`
- `components/costlens/ProjectDashboard.tsx`
- `docs/deployment.md`
- `docs/production-migrations.sql`
- `docs/security.md`
- `docs/validation-4A.md`
- `lib/ai/cache.ts`
- `lib/ai/client.ts`
- `lib/demo/access.ts`
- `lib/demo/assets.ts`
- `lib/demo/seedPlan.ts`
- `lib/security/guard.ts`
- `lib/supabase/requireProject.ts`
- `package-lock.json`
- `package.json`
- `render.yaml`
- `scripts/prepare-production.mjs`
- `scripts/seed-demo.ts`
- `scripts/verify-production.ts`
- `supabase/migrations/0008_public_demo.sql`
- `tests/unit/aiClient.test.ts`
- `tests/unit/demo.test.ts`
- `tests/unit/mediaMigration.test.ts`

Connections: production seeding uses the existing parse → mapping → validated commit flow and the actual media job pipeline. Public demo login opens the existing dashboard and report components; new read-only controls protect both UI/server actions and direct database access.
