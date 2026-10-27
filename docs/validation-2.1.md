# Step 2.1 validation — 2026-10-27

Phase 1 was committed and pushed to GitHub main at 1bf5bdb. Step 2.1 is isolated on phase-2-ai-foundation.

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Single server-only SDK wrapper | Source-boundary test and bundle scan | PASS | aiBoundary.test.ts; only lib/ai/client.ts imports Anthropic; no private server key names in client bundles |
| Untrusted framing and JSON/Zod retry | Escaped closing-tag injection, JSON/schema/truncation failures, two-attempt cap | PASS | aiClient.test.ts |
| Configured models, max tokens and timeout | Defaults/overrides, unconfigured model/overflow rejection, abort/audit tests | PASS | aiClient.test.ts; 55-second work + bounded audit within 60-second ceiling |
| Usage tokens/latency audit | Real local Supabase rows and exact monthly metrics | PASS | aiIntegration.test.ts; tokens combine retries; cache events have zero provider tokens |
| Cache and user/project/privacy isolation | Real local cache reads/writes, changed privacy context, owner/project checks, current-schema validation | PASS | aiIntegration.test.ts; aiClient.test.ts; cacheKey tests |
| 21st AI request returns HTTP 429 | Actual gateway/cache/audit path with real Redis and private preseeded cache | PASS | aiSettings.spec.ts on desktop/mobile; Retry-After > 0 and friendly inline/toast feedback |
| Import/login/daily budgets | Real Redis/Lua; actual application route tests | PASS | rateLimit.test.ts; aiSettings.spec.ts: import 31/login 11; daily quota rejects 201 |
| Settings usage and stored privacy toggle | Real local auth/DB, reloads, 150-token seeded audit, 21 monthly calls/180 quota after 20 cached requests | PASS | aiSettings.spec.ts |
| Masking and input safety | Email/phone/IBAN/card/address cases, money/date preservation, bounded long-input matching | PASS | aiRedact.test.ts; aiClient.test.ts |
| RLS and fresh migration | All migrations applied to fresh PGlite; real local migration; actual B-vs-A and forged usage tests | PASS | aiMigration.test.ts; aiIntegration.test.ts; 2.1-rls-query-results.txt |
| Managed transport safety | Proxy dispatcher, HTTPS requirement, redirect refusal, consistency tokens, fail-closed errors | PASS | redisTransport.test.ts; rateLimit.test.ts |
| Build/lint/typecheck | Production build and npm scripts | PASS | npm run build; npm run lint; npm run typecheck |
| Unit/database regression suite | Real local Supabase and disposable Redis runner | PASS | 228 passed; 4 explicit live-network tests skipped |
| Browser regression suite | Production app, real local Supabase/Redis, 1440px/390px | PASS | 24 passed; 2 unrelated opt-in external import checks skipped |
| Real Anthropic + hosted Upstash connection | Runtime/Next env availability check | FAIL | ANTHROPIC_API_KEY, Upstash URL/token and hosted service-role key are absent; no live provider success claimed |

Commands:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Targeted iterations:
node scripts/test-local-rls.mjs --browser -- tests/e2e/aiSettings.spec.ts
```

The local Redis fixture executes the Upstash limiter script bodies atomically on stock Redis, translating only the vendor-specific Lua shebang metadata. Anthropic responses are controlled in deterministic tests, and browser tests preseed an owner-scoped cache entry to avoid paid calls. The separate real-provider test is explicitly skipped without COSTLENS_LIVE_AI=1 and a real key. Skips are not counted as passes.

Failures fixed during validation: phone masking left an opening parenthesis; that framing is now consumed. A transport test reused a consumed mock Response; it now returns fresh responses. A mobile toast temporarily covered a connection button; notifications now have close controls and browser tests dismiss real notifications before reusing covered controls. The fresh Redis-backed limiter initially rejected Upstash-specific shebang metadata; the test-only transport adapts that metadata, not the algorithm or production limits. Strict type/lint issues were fixed before the successful production build. The final full suites pass.

Every requested local behavior has automated coverage. Remaining validation gaps are external: real Claude JSON output/model availability, hosted Upstash and applying migration 0005 to the hosted database. To close them, securely configure the values listed in [ai.md](ai.md), allow the configured service hosts through the managed network policy, and run the explicit live smoke check or the Settings connection check. Never replace this evidence with a synthetic-provider success claim.

Migration 0005 adds ai_usage, owner preferences and owner/project cache metadata. Cache remains server-only; usage is owner-read-only and server-written. User/project deletion cleans owned cache entries. All seven public tables have RLS enabled; actual query output is saved alongside this report. Generated local test users and cache entries are removed after testing. No screenshots were generated.

Changes: lib/ai client/cache/cacheKey/errors/preferences/redact/store/testTask/usage modules; lib/security rateLimit/redis; migration 0005; AI test and bounded authenticate API routes; Settings page/action/loading/AiSettings; auth form/action and import route enforcement; toast close controls; example model/ingress env names; test runner/Redis fixture/browser ingress fixture; gateway/privacy/cache/RLS/transport/rate/browser/live-opt-in tests; README/CLAUDE/security/testing/AI docs.

Deployment requires Anthropic, Upstash REST, Supabase service-role and existing public Supabase settings. Optional model overrides and TRUST_PROXY_HEADERS are documented in .env.example. This branch intentionally fails closed for login/import when Redis is unavailable; configure it before deployment/merge. Main remains the Phase 1 app.

Step 2.1: NOT READY for live use — implementation and local validation complete; real-provider/hosted-service credentials, hosted migration and live checks remain.
