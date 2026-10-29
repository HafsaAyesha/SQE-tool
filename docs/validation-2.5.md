# Step 2.5 validation

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Standard deviation, IQR, group share, missing estimates and duplicates | Pure deterministic tests, null/zero/currency/credit cases | PASS | tests/unit/anomalies.test.ts |
| Authoritative summaries with schemas, privacy, quotas and cache invalidation | Real local Supabase/Redis integration and migration trigger checks | PASS | tests/unit/summarise.test.ts; summariseRoute.test.ts; aiIntegration.test.ts; migration 0007 |
| Real Gemini summary explains planted AI API outlier | Opt-in real-provider smoke test, validated 150–200 words and anomaly references | PASS | COSTLENS_LIVE_AI=1 COSTLENS_LIVE_VISION=1 node scripts/test-local-rls.mjs --all; tests/unit/aiLive.test.ts |
| Desktop side panel/mobile tab, regeneration, time/disclaimer, anomaly focus and filter | Production browser tests with 124 rows and off-page anomaly | PASS | tests/e2e/insightsReports.spec.ts |

Changed files: lib/costs/anomalies.ts; lib/ai/{summarySchema,summaryPrompt,summaryData}.ts; lib/ai/tasks/summarise.ts; app/api/projects/[id]/ai/summarise/route.ts; components/costlens/{InsightsPanel,ProjectDashboard,CostTable}.tsx; supabase/migrations/0007_insight_cache_invalidation.sql; summary/anomaly/gateway/integration/browser tests; docs/insights.md.

Connections: uses calc.ts exclusively for variance/aggregates, the existing server-only Gemini gateway and private cache, and dashboard URL filters. Cost changes invalidate summary cache; an all-fields data hash prevents concurrent stale cache reuse. Opaque row aliases go to AI and map back to authorized row IDs on the server.

Configuration: existing Gemini, Supabase and Upstash variables. Both default model roles use gemini-flash-lite-latest (real generation verified as gemini-3.5-flash-lite); explicit GEMINI_MODEL_SMART/FAST overrides remain available. Apply migration 0007 on hosted Supabase before deployment.

Gaps: AI explanations remain suggestions and carry the required verification disclaimer. Browser UI tests seed validated cache for deterministic results; a separate real-provider test verifies actual model output.

Step 2.5: READY locally; hosted migration/deployment remains separate.
