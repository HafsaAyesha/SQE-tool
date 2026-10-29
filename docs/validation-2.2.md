# Step 2.2 validation — 2026-10-28

Gemini replaces Anthropic at the user's explicit request. All changes remain on `phase-2-ai-foundation`.

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Gemini uses the single server-only gateway; no Anthropic key/SDK required | Transport/boundary tests, package manifest and env checks | PASS | aiClient.test.ts; aiBoundary.test.ts; environment.test.ts |
| Unmatched or <0.6 required fields offer AI mapping | Pure threshold/confidence tests and browser fixture | PASS | aiMapping.test.ts; aiMapping.spec.ts |
| Only columns and up to five bounded samples are sent, with privacy masking | Sample validation and real local gateway with controlled Gemini output | PASS | aiMapping.test.ts; aiIntegration.test.ts |
| Zod rejects invented/reused columns, unsupported fields and invalid confidence | Task and route tests | PASS | aiMapping.test.ts; aiMappingRoute.test.ts |
| Fast model, canonical sample cache, user/project isolation and quotas | Task options, real local cache/Redis/audit tests and 21st-call HTTP 429 | PASS | aiMapping.test.ts; aiIntegration.test.ts; aiSettings.spec.ts |
| One-click odd-header mapping, AI reasons, user confirmation and template reuse | Desktop/mobile browser test with private preseeded cache | PASS | aiMapping.spec.ts: Deliverable → Item, Quoted → Estimated, Invoiced → Actual; no cost rows before confirmation; 3 rows after Save; saved template reapplied |
| Lint, typecheck and production build | npm scripts | PASS | npm run lint; npm run typecheck; npm run build via local browser runner |
| Full unit/integration regression | Real local Supabase and disposable Redis | PASS | 238 passed; four opt-in external tests skipped |
| Full browser regression | Real local Supabase/Redis at desktop/mobile widths | PASS | 26 passed; two unrelated external-source checks skipped |
| Actual Gemini output/model availability and hosted Redis | Environment policy and configuration checks | FAIL | Gemini key is present; generativelanguage.googleapis.com is excluded by enforced outbound policy; hosted Upstash URL/token are absent. No paid live request or hosted-service success is claimed. |

Commands:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Explicit opt-in live provider test, after allowing the host:
COSTLENS_LIVE_AI=1 node scripts/test-local-rls.mjs --all
```

Initial browser validation exposed an undefined-confidence render error on unmatched columns. It was fixed with `mappingFieldConfidence`, a regression test was added for empty/unmatched initial mappings, and validation was rerun. The old environment-template assertion was updated to require Gemini variables after replacing the provider. Skipped real-provider/source checks are not passes. Controlled Gemini output validates the actual request and response format locally; private seeded browser cache entries exercise the actual auth, project checks, rate limits, schema validation and usage path, rather than replacing the API with a browser-only fake. No screenshots were generated.

Changes: lib/ai/client.ts (Gemini HTTP, bounded envelope, token counts, compatibility alias); cacheKey.ts (Gemini namespace); schemas.ts, mappingPrompt.ts and tasks/suggestMapping.ts; project import/suggest-mapping API; ImportMapping.tsx; odd-header CSV fixture; mapping task/route/browser tests; updated gateway/integration/live/boundary/environment/settings tests; package manifest/lock removing Anthropic SDK; .env.example, CLAUDE.md, README and AI/security/testing documentation. The pre-existing Step 2.1 validation recheck document is retained.

Connections: the mapping task uses the existing Step 2.1 gateway. Its accepted mapping is passed to the existing preview, transactional commit and saved-template flows; no AI response writes cost rows directly. No new database migration is required beyond Step 2.1 migration 0005.

Configuration: GEMINI_API_KEY only (no ANTHROPIC_API_KEY); optional GEMINI_MODEL_FAST/SMART (default gemini-3.8-flash, override with a model available to your Google project). Live model availability is unverified. Keep Supabase public/service credentials and Upstash REST URL/token configured. Apply migration 0005 to the hosted database if not already applied. Allow generativelanguage.googleapis.com and your Upstash host in the managed outbound configuration; do not bypass the proxy or disable TLS verification.

Final browser rerun: **26 passed, 2 skipped**. Recognizable real API-key pattern scan found zero files; no private env files are tracked and private server env names were absent from client bundles. `git diff --check` passed.

Step 2.2: NOT READY for live use — implementation and local validation complete; enable Gemini outbound access, configure hosted Upstash and verify the configured model with the real-provider smoke check. No Anthropic credential is required.

## Current environment recheck, 28 October 2026

The earlier outbound-policy/configuration gap above is historical. Gemini access is now available. The opt-in live suite passed validated JSON plus cache reuse, real receipt-image extraction, and a real validated cost summary. The verified default is gemini-flash-lite-latest (returned modelVersion gemini-3.5-flash-lite); older model names were rejected for this account. Mapping browser tests continue to pass against the production build with deterministic private-cache fixtures. Hosted deployment and database configuration are separate from local validation.
