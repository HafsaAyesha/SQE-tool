# Step 1.6 validation — 2026-10-27

Validated against a real local Supabase instance and a production Next.js build. Google Sheets live checks are excluded at the user's instruction. JSON API and HTML checks use actual public sources, not mocked responses.

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Suggestions, confidence and manual mapping | Unit tests plus browser mapping of unusual headings | PASS | mapping.test.ts; mapping.spec.ts unusual CSV |
| Currency/separator/credit/date conversion | Pure conversion assertions and persisted database values | PASS | mapping.test.ts; EUR values 1100/-20 and dates 2024-01-01/02 in mapping.spec.ts |
| Templates save privately and auto-apply | Real browser save/reload and matching same type/columns; RLS/RPC assertions | PASS | mapping.spec.ts; importTransaction.test.ts; templates route owner filter |
| Preview, problem outlines, correction and skip | Real CostTable preview, inline corrections and skip bad rows | PASS | mapping.spec.ts problems.csv |
| All rows beyond initial preview are saved | Initial preview 200/501, mapping 501, database exact count 501 | PASS | mapping.spec.ts all-rows.csv |
| Append and source-only replacement | Direct PostgreSQL transaction tests and browser replacement | PASS | importTransaction.test.ts; mapping.spec.ts preserves manual and other sources |
| Server validates every confirmed row | Direct route calls with invalid rows and direct RPC calls | PASS | commitRoute.test.ts; importTransaction.test.ts |
| Atomicity | Deliberate template-save error after deletion/insertion rolls back both | PASS | importTransaction.test.ts rollback test |
| Ownership and source/project isolation | B gets 404; cross-project source/RPC failures | PASS | mapping.spec.ts; importTransaction.test.ts |
| Formula-like text escaped | Route and direct RPC tests; persisted literal prefix in browser test | PASS | sanitize.ts; mapping.test.ts; commitRoute.test.ts; importTransaction.test.ts; mapping.spec.ts |
| Structured fixtures import end to end | CSV, TSV, XLSX, XLS, ODS, JSON, XML, MS Project XML, paste, unusual CSV | PASS | mapping.spec.ts actual parse/commit APIs and local database |
| Live JSON API and HTML table import end to end | Actual link UI → mapping → confirmation → commit → 203 persisted rows | PASS | mapping.spec.ts live JSONPlaceholder/W3C test, desktop and mobile |
| Build/lint/typecheck | npm scripts | PASS | npm run build; npm run lint; npm run typecheck |
| Unit/database suite | Local Supabase runner | PASS | 169 passed; 3 opt-in network tests skipped explicitly |
| Browser suite | Production build, real local Supabase, desktop 1440 and mobile 390 | PASS | 18 passed, including opt-in real JSON/HTML imports |

Commands:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
COSTLENS_LIVE_ONLINE=1 node scripts/test-local-rls.mjs --browser
```

The focused live browser checks cover JSON/HTML despite the separate unit network suite remaining opt-in. Skipped tests are not counted as passes. No screenshots were created. Generated users are removed in finally blocks and the final local auth.users cleanup query returns zero matching costlens-%@example.com users.

Earlier browser failures exposed a numeric-string Excel serial date conversion gap and input events arriving before wizard hydration; both were fixed. The project Import entry uses ordinary document navigation to avoid an intermittent client navigation stall. Existing pagination assertions now scope DOM reads to the accessible Cost items region because hidden transition markup can temporarily remain in the document.

Configuration: apply supabase/migrations/0004_import_commit.sql after 0001–0003 in the hosted project. It adds the invoker RPC and template creation timestamps/index. It was applied and exercised locally; hosted application is not claimed. Step 1.6 adds no environment variables. SOURCE_ENCRYPTION_KEY remains necessary only for explicitly saved online connection credentials.

Files added: lib/import/mapping.ts, commitSchema.ts; lib/security/sanitize.ts; ImportMapping.tsx; import commit/templates API routes; migration 0004; mapping, commitRoute, importTransaction unit tests; mapping browser tests; unusual CSV fixture; this validation report. Files updated: ImportWizard.tsx, CostTable.tsx, project import page, parse/fetch routes, ProjectActions/ProjectSwitcher, existing project browser selectors, README and import/security/testing docs.

All adapters use the same shared CostRow validation and commit gate. Future AI suggestions can feed the existing field/column mapping. API retry idempotency is not implemented; an ambiguous save-network error asks the user to check the dashboard before retrying an append. Google Sheets is outside this step's agreed live validation scope.

Step 1.6: READY (validated locally; hosted migration application required).
