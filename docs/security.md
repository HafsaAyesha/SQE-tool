# Authentication and ownership

- Server actions validate email, password and action mode using Zod. Passwords require 10–128 characters. Provider errors are mapped to friendly generic messages; logs exclude credentials, passwords and provider response bodies.
- Sessions use Supabase SSR cookies. Middleware verifies users with `getUser()` and carries refreshed cookies onto both normal and redirect responses. The dynamic workspace layout also checks the authenticated user; authorization does not depend on middleware alone.
- Protected URL prefixes are `/projects`, `/import`, `/reports` and `/settings`; route-group folder names are not URL segments. Register future workspace prefixes in middleware, keep their layout guard, and call `requireProject` in project-specific handlers.
- The public anon key is safe for the browser only because ownership is enforced by RLS. Never expose a service-role key or use it to bypass project ownership.
- Logout uses a server action and reports provider failures. Confirmation accepts only email/signup token types and redirects to fixed local destinations; caller-provided redirect URLs are ignored.
- Supabase Auth supplies its own abuse limits. Application-specific Upstash rate limiting is a future integration; do not assume those limits have been implemented here.
- Do not cache authenticated HTML across users. The workspace layout is dynamic, and session middleware/confirmation responses use private, no-store caching.

Project URL ownership is also checked in middleware before the page begins streaming. This ensures inaccessible or malformed project IDs produce HTTP 404 instead of a streamed HTTP 200 carrying a not-found UI. Refreshed cookies are preserved and responses are private/no-store. Database lookup errors return 503 rather than masquerading as missing projects. This preliminary check supplements requireProject; it does not replace the server action/page guard or RLS.

Structured imports have byte/row/column limits, executable-signature rejection, ZIP directory plus actual expansion checks, UTF-aware DTD/entity rejection and in-memory parsing. Online imports add public-only DNS validation and IP-pinned sockets, verified TLS, a global deadline, byte/decompression caps and restricted redirects. Optional API-key headers are transient unless explicit source saving is requested; full source configurations then use project/type-bound AES-GCM. See docs/imports.md for exact guarantees, trusted-proxy requirements and current network validation blockers.

Step 1.6 confirms rows through a bounded, project-authorized commit route with per-row Zod validation and formula-text escaping. Migration 0004 uses a SECURITY INVOKER RPC with explicit owner/source checks and existing RLS; it atomically saves source metadata, rows and templates, and replaces only the chosen source. It additionally validates precision/length/date/range constraints and escapes formula-like text for direct authenticated calls. A project lock serializes concurrent imports. Mapping templates remain private to their owners. Imports allow negative credit amounts, while manual row entry remains nonnegative.

Step 2.1 routes all Gemini HTTP use through the server-only AI gateway. Owner/project checks, persisted privacy settings, escaped untrusted-data framing, JSON/Zod validation, one retry, token/time ceilings and mandatory usage audit precede result delivery. Server-only caches are scoped by owner/project/prompt/schema/model/privacy and have ownership deletion FKs. AI usage is owner-readable but not client-writable; preferences are owner-scoped. Upstash limits fail closed and apply before cache hits. Login/import use those same enforced budgets, so configure Upstash before deploying the Phase 2 branch. See [AI security/configuration](ai.md), including trusted ingress headers, Supabase native auth controls, masking limitations, cache reuse TTL and real-vs-controlled test scope.

## Step 3A hardening inventory (29 October 2026)

The configuration is now `next.config.ts`. All responses receive CSP, HSTS, nosniff, strict-origin-when-cross-origin, disabled camera/microphone/geolocation and DENY framing. CSP permits only the configured Supabase HTTP/WebSocket origin and Upstash origin for connections, and self/data/blob/configured Supabase for images. Video playback allows the private Storage origin. Next.js hydration and Tailwind/Recharts need inline script/style support in this static policy; it does not claim nonce-based strict CSP. Development additionally allows eval and loopback HMR WebSockets. Never add raw secrets to the header or a NEXT_PUBLIC variable.

Routes changed in 3A:

| Route | Change / retained boundary |
| --- | --- |
| GET /api/projects/[id]/import/templates | New shared withGuard owner check/read limiter; friendly errors and server logging |
| GET/DELETE /api/projects/[id]/media/jobs/[jobId] | New shared withGuard/read limiter; Zod UUID validation before job lookup |
| POST /api/media/worker | New distributed authenticated-worker limiter, after existing HMAC/timestamp verification; worker callbacks intentionally use service authentication rather than browser sessions |
| POST /api/projects/[id]/import/suggest-mapping | Add unexpected-error server logging; existing requireProject, bounded Zod sample and gateway quota retained |
| POST /api/ai/test | Add unexpected-error server logging; existing verified user, fixed validated input and gateway quotas retained |
| GET /api/projects/[id]/report.pdf, .xlsx, .csv | Add server logging; existing requireProject, validated options, RLS and report limiter retained through lib/report/api.ts |

All other /app/api routes were inspected: authenticate validates bounded JSON and uses the login/IP limiter (login/signup are necessarily public); import parse/fetch/commit requireProject, validate bounded input and enforce the import limiter; suggest-mapping and summarise authorize before the central AI gateway enforces user/daily limits; media upload-url/job creation authorize, validate and enforce the import limiter. The fixed AI connection task takes no user-controlled prompt. Worker poll/claim uses HMAC authentication and job-scoped signed URLs; extract derives its owner/project from the claimed job before the same AI/privacy gateway.

Server actions changed: createProject, renameProject, deleteProject, saveCostItem and deleteCostItem now enforce 120 mutations per ten minutes per verified owner, withAction returns friendly errors and preserves Next redirect/not-found control flow. setMaskPersonalData has the same mutation limiter; signOut now verifies the user and rate-limits before invalidating the session. authenticate already has the IP limiter; its redirect flag is now also boolean-validated. Project/row IDs and all mutation values retain their Zod validation; no-input actions have no caller data to validate.

File-safety review: every registered adapter is wrapped by guardedAdapter; non-online documents use magic-byte/allow-list and 10 MB checks, online input uses the bounded SSRF-safe fetcher plus structured guards, and raw tables are capped at 5,000 rows/256 columns. ZIPs are checked before inflation (32 MB expansion, 2,000 members, unsafe paths/encryption/macros rejected). DTD/entity scanning now includes case-insensitive XML and relationship parts. Email attachments re-enter the guarded registry, with depth 1 and cumulative page/attachment caps. PDF/document/slide plans cap units at 20 and require consent beyond five; images reject >40 MP before pixel decoding and resize to 2,000 px; recordings use separate signed-upload/500 MB reservations and worker ffprobe codec/duration limits (30 minutes). Registry media parsing explicitly refuses the document endpoint. These limits already existed except the relationship/mixed-case XML DTD gap fixed here.

Secrets: the existing gateway/encryption/Redis/media modules are server-only or reached only from server modules. The client import-graph test walks client imports (excluding server-action proxies/type imports), rejects private environment access and server-only/Node imports, and allows only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. No new public secret variable was introduced.

Audit: app initially had 2 critical and 2 high findings; worker had 1 high. Upgraded Zod to 4.6.7, Vitest to 4.1.12, the Zod-aware form resolver, and pinned the patched PostCSS 8.5.32 via override while retaining Next.js 15. Zod's native JSON-schema exporter replaces zod-to-json-schema; partial field mappings retain partial-record semantics. Recheck: app 0 critical/0 high (2 moderate transitive ExcelJS/uuid findings remain); worker 0 findings. No major Next.js/framework swap was performed.

Run `npm run test:security` with the local Supabase stack running and GEMINI_API_KEY configured. It reuses scripts/local-redis.mjs, the existing invalid-file and insight fixtures, and the existing ephemeral A/B RLS account convention; no persistent shared test accounts exist. It starts a local Next dev server, refuses hosted database targets, deletes fake users and stops the disposable services afterward. Results are in [security-test-results.md](security-test-results.md). For a failed check, pass `-- --testNamePattern '<name>'`; only that scenario reruns and prior unaffected table rows are retained. The rate test seeds an owner-scoped cache fixture to measure the real limiter without model latency; the malicious-note check calls the real model and requires a real uncached usage record.

### Step 3A checks completed

- `npm run lint`: PASS, zero warnings.
- `npm run typecheck`: PASS; worker `npm --prefix worker run typecheck`: PASS.
- Focused changed-file Vitest checks: authActions (8), projectActions (12), aiBoundary (2), documents (15): 37 tests PASS. aiLive's three opt-in tests were skipped; the HTTP security scenario separately made a real Gemini call.
- `npm run test:security`: initial run passed invalid uploads, foreign ownership and SSRF. The provider-dependent rate scenario and dashboard-only HTML assertion failed; those were corrected and only those two scenarios were rerun with `-- --testNamePattern '3\. Excessive|5\. Malicious'`: both PASS. All five final table entries are PASS. Rate checks now explicitly use a cached fixture, and HTML is checked in the server-rendered report preview rather than a client-only dashboard placeholder.
- The project-action unit test's synthetic 404 now includes Next's actual not-found digest so the friendly-error wrapper can preserve the real 404 behavior; the test was rerun and passed.
- `npm audit` / worker audit: 0 high or critical; app 2 moderate / worker 0 total.
- Recognizable secret-pattern scan: 0 matching files; `.env` and `.env.local` are git-ignored. Client import-graph assertion PASS.
- `git diff --check`: PASS.
- No Playwright, production build or full unit suite was run for this phase, following FAST TESTING RULES. Existing browser cache fixtures received only the Zod JSON-schema API import updates required by the dependency patch; they were not executed.

Configuration: no new app environment variables or database migrations. Existing Supabase and Upstash variables remain required. To run security tests locally, start Supabase as documented and configure GEMINI_API_KEY; the runner supplies only disposable local database/Redis settings and test worker credentials. Production should use HTTPS so HSTS is effective. Existing Phase 2 worker deployment/configuration gaps remain outside this security task.

Step 3A: READY.

### Step 3A files changed

- `app/(app)/projects/actions.ts`
- `app/(app)/settings/actions.ts`
- `app/(auth)/actions.ts`
- `app/api/ai/test/route.ts`
- `app/api/media/worker/route.ts`
- `app/api/projects/[id]/import/suggest-mapping/route.ts`
- `app/api/projects/[id]/import/templates/route.ts`
- `app/api/projects/[id]/media/jobs/[jobId]/route.ts`
- `docs/security-test-results.md`
- `docs/security.md`
- `lib/ai/client.ts`
- `lib/ai/schemas.ts`
- `lib/costs/schema.ts`
- `lib/import/mapping.ts`
- `lib/import/schema.ts`
- `lib/media/http.ts`
- `lib/projects/schema.ts`
- `lib/report/api.ts`
- `lib/security/fileGuard.ts`
- `lib/security/guard.ts`
- `lib/security/rateLimit.ts`
- `lib/security/urlGuard.ts`
- `next.config.js`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/test-security.mjs`
- `tests/e2e/aiMapping.spec.ts`
- `tests/e2e/aiSettings.spec.ts`
- `tests/e2e/documents.spec.ts`
- `tests/e2e/insightsReports.spec.ts`
- `tests/e2e/media.spec.ts`
- `tests/security/security.test.ts`
- `tests/unit/aiBoundary.test.ts`
- `tests/unit/aiLive.test.ts`
- `tests/unit/authActions.test.ts`
- `tests/unit/documents.test.ts`
- `tests/unit/projectActions.test.ts`
- `vitest.security.config.ts`
- `worker/package-lock.json`
- `worker/package.json`

Connection: the results table feeds the Phase 3B write-up and Phase 4B final report. Authorization, validation, rate limiting and export safety use the existing Supabase/AI/import/report paths; there is no test-only bypass in production code.
