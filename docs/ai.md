# Safe AI gateway — Step 2.1

Phase 1 was committed as `1bf5bdb` and pushed to GitHub main. Step 2.1 is developed separately on `phase-2-ai-foundation`; it does not change main until that branch is merged.

## One entry point

Only `lib/ai/client.ts` calls the Gemini API, and the module starts with `import 'server-only'`. Every future Gemini feature must call callAI. The repository conventions and aiBoundary.test.ts enforce that import boundary.

```ts
const result = await callAI({
  task: 'summary', // mapping | extraction | summary | anomaly | test
  projectId,      // required by convention for every project feature
  system: 'Summarise the cost data using the requested response fields.',
  userContent: text,
  schema: z.object({ summary: z.string().max(2000) }).strict(),
  maxTokens: 1024,
  model: 'smart', // optional: mapping defaults to fast; other tasks default to smart
});
// result.data is schema-validated; result also contains cached/model/inputTokens/outputTokens.
```

The wrapper derives the current user from Supabase Auth. It never accepts a caller-supplied user ID. A supplied projectId goes through requireProject before limits, cache or provider calls. Only the two configured model IDs (or the smart/fast selectors) are accepted. Defaults are `gemini-flash-lite-latest` for both roles (override GEMINI_MODEL_SMART to select a different available model); no silent model fallback occurs. Configure the optional override variables if those IDs are unavailable to your Gemini account.

Text input is bounded to 1 MiB UTF-8; system text to 16,000 characters. Output is capped at 8,192 tokens (default 2,048). The HTTP transport does not automatically retry. Provider envelopes are validated and capped at 2 MiB; only invalid generated JSON gets the one repair attempt. The system prompt says that untrusted content is data, never instructions, requests JSON only, and includes a JSON Schema generated from the caller's Zod schema. User/file text is XML-escaped inside untrusted_data tags, so literal closing tags cannot break the boundary. No tools are supplied. These are prompt/data boundaries, not a claim that models cannot hallucinate; schema validation enforces structure, not factual correctness.

The response must be plain JSON and pass the original Zod schema. Invalid JSON, truncation or schema failure triggers one retry with a bounded, escaped validation report; raw model text is not appended as trusted instructions. A second failure returns a friendly 502. The 60-second ceiling reserves 55 seconds for the workflow/provider and up to 4.5 seconds for the mandatory audit write. The provider is aborted at the workflow deadline. Input/output tokens across both attempts and latency are recorded even on a provider/validation failure after quota admission. If mandatory auditing fails, the result is withheld with an error. Prompts, raw responses, keys and personal data are not logged.

## Privacy preference

Masking defaults on and is stored in user_preferences under owner RLS. The gateway rereads it for every request; callers cannot override it. A missing preference row means on. A failed preference lookup pauses the AI request instead of guessing. Settings saves derive the user ID from the session and accept only a boolean.

redactPersonalData replaces detected emails, phone numbers, common IBAN formats, 13–19 digit card-like numbers and common street addresses with placeholders. It runs on user text, system/schema text and retry validation reports before any provider call. It retains no original-value lookup map. Email matching is bounded so large non-email input does not cause unbounded backtracking. Ordinary cost amounts and ISO dates are preserved in covered cases.

Detection is heuristic and has false positives/negatives, especially for international addresses and ambiguous numbers. The same gateway accepts bounded PDF/image parts for document extraction. Raw visual content is refused while masking is enabled, because text redaction cannot mask pixels reliably; users must explicitly disable masking to extract scanned documents/images. Media jobs omit video frames while masking is enabled and redact the transcript through this gateway. No alternative provider path bypasses that preference. Prefer opaque column IDs to personal-data-bearing schema enums. The settings UI states that masking is best-effort, and prevents racing a preference save with its own connection check.

## Distributed limits and errors

Upstash Ratelimit enforces, across app instances:

| Budget | Key | Policy |
| --- | --- | --- |
| AI | verified user ID | 20 helper requests / 10 minutes, sliding window |
| Import | verified project owner/user ID | 30 parse/fetch/commit requests / 10 minutes, shared window |
| Login/signup | trusted client IP | 10 authentication requests / 10 minutes |
| Daily AI | verified user ID | 200 admitted helper requests / UTC day |

Limits run before cache reads. Cached results count toward both AI budgets; blocked requests do not invoke Gemini or create a usage event. One helper request can make up to two provider attempts, whose tokens are combined in its single usage event. IP/user limiter identifiers are SHA-256 hashed before being used as Redis keys. Analytics and fail-open timeout fallback are disabled. Missing/unreachable Redis returns 503, never an unlimited pass.

rateLimitResponse maps limits to HTTP 429 with Retry-After seconds and private/no-store responses. AI connection checks, file/link imports and the login form show the friendly server message in both inline feedback and Sonner toasts. Login UI uses the bounded JSON authenticate API so HTTP 429/Retry-After reach the browser; the legacy server action retains server-side limits too.

Redis uses the official Upstash SDK/Ratelimit algorithms with a custom Requester for bounded HTTP, consistent-read tokens and managed proxy support. Public backends require HTTPS; redirects are disabled, TLS verification stays enabled, and the inherited HTTP(S) proxy is retained. HTTP is allowed only for explicitly configured loopback test backends. There is no production fake-provider or limiter-bypass mode.

On Vercel, platform forwarded IP headers are trusted. Elsewhere leave TRUST_PROXY_HEADERS empty unless your ingress **overwrites** forwarded-IP headers before traffic reaches Next.js. Without a trusted source, unidentified requests share a conservative unknown-client budget. Never enable proxy-header trust on an app directly exposed to arbitrary header spoofing. Keep Supabase Auth's own provider-side rate controls configured too: the public Supabase auth API is independently reachable.

## Cache and usage

The cache key is SHA-256 over framed canonical JSON containing task, model and input. The input namespace includes verified owner, authorized project, masked system/content/schema, maxTokens and privacy mode. Changing any of these prevents stale/cross-user/cross-project reuse. Raw input is not stored in the cache. Cached results are Zod-validated again before return.

ai_cache stays server-only, with no client privileges/policies. The query also requires owner/project metadata, beyond the scoped hash. Migration 0005 adds ownership FKs so account/project deletion removes owned cache rows. Legacy unscoped rows are ignored. Cache reads accept entries created within seven days; this is a reuse TTL, not a scheduled physical-deletion job. Old inactive entries remain until explicit cleanup or owner/project deletion.

ai_usage is client-read-only under owner RLS; only trusted server credentials write usage. It contains the requested user/project/task/token/timestamp fields plus model, latency_ms, cached and success. Project deletion preserves monthly usage with project_id set null; account deletion cascades usage/preferences/cache. Usage captures admitted failures as well as successes and cache hits. Cached events have zero provider tokens. Tokens include prompt, candidate and thinking tokens across retries.

/settings shows calls, input+output tokens this UTC month, cache-call count, remaining daily Redis quota, a persistent privacy toggle and a small connection check. Stats paginate beyond Supabase row caps. A quota-read failure is shown as unavailable, not a fabricated remaining count.

## Configure before deploying this branch

1. Apply `supabase/migrations/0005_ai_foundation.sql` after migrations 0001–0004. Do not reset an existing hosted database.
2. Configure the existing Supabase URL/anon key and server-only SUPABASE_SERVICE_ROLE_KEY, plus GEMINI_API_KEY and UPSTASH_REDIS_REST_URL/TOKEN. Copy the **REST** endpoint/token from Upstash, not a TCP Redis connection string.
3. Optionally set GEMINI_MODEL_SMART / GEMINI_MODEL_FAST. Empty variables use the requested defaults above.
4. Configure ingress IP trust as described above. Vercel is detected automatically.
5. Permit generativelanguage.googleapis.com, the configured Supabase host and the configured Upstash host through any managed outbound policy. Do not bypass a proxy denial or disable TLS verification.

**Login/import now fail closed without Upstash. Configure those variables before deploying/merging the feature branch.** Main remains the completed Phase 1 app. .env.example contains names only, and .env files remain ignored.

## What was actually validated

Tests use real local Supabase and real Redis/Lua. The local test-only REST transport translates Upstash's allow-key-locking shebang metadata for stock Redis (which provides stronger global Lua atomicity); it executes the same limiter script bodies. Tests verify request 21/31/11 and the daily 201st request are rejected, with actual HTTP headers/toasts at the app boundary. Unique per-test IPs model a trusted ingress without disabling production limits. Fixtures use fresh disposable Redis and clean generated users/cache entries.

Gemini responses are controlled in the deterministic gateway tests. Browser settings tests preseed a private valid cache entry, so they exercise the real gateway/cache/audit/quota without paid provider calls. These are not presented as a live Gemini success. A separate opt-in smoke test uses the real SDK/provider, validates JSON and verifies the repeat is cached:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Focused browser validation:
node scripts/test-local-rls.mjs --e2e -- tests/e2e/aiSettings.spec.ts
# Only after securely configuring a real Gemini key/model/network access (one small paid call):
COSTLENS_LIVE_AI=1 node scripts/test-local-rls.mjs --all
```

The runner overrides Supabase/Redis only with disposable local test backends; it never publishes local keys or configures production secrets. Normal tests do not contact a configured hosted Redis just because a URL exists. Live Gemini and hosted Upstash checks remain pending: hosted Redis credentials are absent and the Gemini endpoint is not currently allowed by the managed outbound policy. No screenshots are generated.


## Step 2.2: mapping assistance and Gemini migration

Gemini replaces Anthropic at the user's request; no Anthropic key or SDK is needed. `callAI` is the provider-neutral entry point, with `callClaude` retained only as a compatibility alias to the same Gemini wrapper. The cache namespace is versioned for Gemini so old Claude outputs cannot be reused. Set `GEMINI_API_KEY` server-side. `GEMINI_MODEL_FAST` and `GEMINI_MODEL_SMART` may override the defaults; use a model available to your Google project. The fast alias was verified with a real JSON response; model aliases can change upstream. API keys are sent in the x-goog-api-key header, never the URL; TLS verification, inherited proxy support and redirect rejection remain enabled.

POST `/api/projects/[id]/import/suggest-mapping` authorizes project access before accepting a bounded JSON sample. It accepts unique columns and up to five rows containing only declared columns, with 1,000-character cell limits. The task uses the fast model through the same masking, quotas, private cache, JSON retry and audit path. Canonical columns/sample content participates in the SHA-256 cache key after masking; file names and remaining rows are excluded. The response schema rejects unknown fields, duplicate source columns, invented columns and invalid confidence values. No AI suggestion writes imported rows.

The Mapping screen offers assistance when item, estimated or actual is missing or has confidence below 0.6. It preserves manual choices, applied templates and strong synonym matches. AI badges expose confidence and keyboard-accessible reason tooltips. Users may change suggestions, then confirm through Preview and Save; the existing template flow persists an accepted mapping and reapplies it to matching source columns. On timeout, 429 or validation failure the selects remain usable for manual mapping.

The odd-header fixture is `tests/fixtures/codeaudit-ai.csv`: Deliverable / Quoted / Invoiced. Unit tests cover bounded samples, schemas, task choice and errors. Integration tests use the actual local Supabase/Redis gateway with controlled Gemini HTTP output. Browser tests seed a private validated cache entry and exercise the real route/gateway/audit flow, one-click mapping, tooltips, confirmation, saved rows and template reuse. These controlled results do not establish live Gemini model availability.
