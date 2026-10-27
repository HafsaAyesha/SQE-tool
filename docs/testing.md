# Step 1.1 validation

Unit tests cover shared money formatting (USD/EUR/JPY, zero, negative) and percent ratios, rounding and negative variance. E2E tests cover landing calls to action, placeholder auth destinations, shell pages, active navigation, system theme default, light/dark switching and persistence, mobile Sheet navigation and closing, user menu, runtime errors and horizontal overflow. Both landing and shell produce screenshots in each theme at desktop/mobile widths for visual review.

Build, lint and strict type checks cover all generated UI components. These smoke tests do not cover authentication, Supabase policies, importers or cost analysis; those features are not implemented yet. No external credentials are required at this stage.

## Acceptance rerun

All five commands passed: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (3 tests), `npm run test:e2e` (4 tests). Playwright automatically uses `/usr/bin/chromium` if present, with an explicit executable-path environment override supported; elsewhere it uses its downloaded Chromium.

Exact viewports are 1440×900 and 390×844 at device scale 1. Ten PNGs are saved in `docs/screenshots/1.1-*.png`: landing and shell in each theme at both widths, plus the open mobile menu in each theme. PNG dimensions were checked and representative screenshots reviewed. Both light and dark selections are asserted after reload.

The exact USD 1234.5 → $1,234.50 and ratio -0.125 → -12.5% assertions pass. The environment test checks the complete, empty template; Git ignores `.env`, `.env.local`, and `.env.production`; no private environment files are tracked. A repository ripgrep scan for private-key headers, common API-token formats, JWTs, and nonempty secret assignments found no matches (generated output, dependencies and the lockfile were excluded). Git reports zero committed revisions, so there is no committed history to scan. Pattern scanning does not prove the absence of every possible credential format.

Changes for validation: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `tests/unit/format.test.ts`, new `tests/unit/environment.test.ts`, this document, and ten screenshots. No application behavior changed and no additional configuration is required. Acceptance coverage gaps were filled by exact negative-percentage, environment-file protection, exact viewport, mobile menu screenshot, and light-theme persistence checks. Cross-browser validation beyond Chromium remains outside this step.

## Step 1.2

The current auth-enabled production build passes `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (30 tests across 8 files), and `npm run test:e2e` (4 tests at 1440px/390px). The SQL migration executes under embedded Postgres; two-user RLS checks cover CRUD boundaries, ownership transfer, cross-project references, constraints, source deletion and project cascades, with no client access to ai_cache. Auth provider calls are mocked in unit tests; browser tests cover real rendered forms and signed-out redirects, not real account creation. The E2E suite checks JavaScript bundle failures and runtime errors as well as form validation and theme persistence.

A browser rerun exposed stale dev output from a lingering development server sharing `.next` with the production build. That server was stopped, generated output was rebuilt, and all 4 browser tests passed on the clean production build. Do not run dev/build against the same output directory simultaneously.

New coverage lives in `tests/unit/auth.test.ts`, `authActions.test.ts`, `confirmation.test.ts`, `requireProject.test.ts`, `session.test.ts`, and `rls.test.ts`, plus the updated `tests/e2e/smoke.spec.ts`. Signup screenshots are in `docs/screenshots/1.2-signup-1440-dark.png` and `1.2-signup-390-dark.png`.

Hosted migration execution, real signup/confirmation/login/logout and the authenticated user menu remain unverified because no Supabase URL or anon key is configured. See `docs/supabase.md` for the exact setup and verification steps. Step 1.2 is not yet ready for a hosted readiness claim.


## Step 1.2 fresh Supabase acceptance validation

A fresh real local Supabase project was started using official CLI slim images, then `supabase db reset --local --no-seed --yes` completed successfully and applied `0001_init.sql`. Actual `pg_tables`/`pg_policies` output is retained in `docs/1.2-rls-query-results.txt`: all five tables have rowsecurity=true; the four owner/child tables each have one authenticated ALL policy; ai_cache has no client policy.

`node scripts/test-local-rls.mjs --all` executed `npm run test` with private local runtime bindings: 34 passed, zero skipped. This includes the four real anon-key signed-client RLS tests in `tests/unit/rls.test.ts`; PGlite-only checks moved to `tests/unit/migration.test.ts`. B reads zero rows from A's project and B's attempted cost insert fails with SQLSTATE 42501. A's positive-control reads/inserts succeed. All generated users and cascading project fixtures were removed; the final matching test-user count was zero.

`node scripts/test-local-rls.mjs --browser` executed `npm run build` and `npm run test:e2e`: 6 passed, zero skipped. Alongside inline input errors and protected-route redirects, real signup/login/logout and the email menu were verified at desktop and mobile widths. `npm run lint`, `npm run typecheck`, and `git diff --check` also passed. No credential-shaped values were found by the repository scan. Only generated local test accounts were created; no hosted users or schemas were modified.

The CLI's container-loopback health probe produced proxy 403s; a direct Auth health request and the functional API/browser suites established readiness independently. See `docs/supabase.md` for the diagnosed workaround and repeatable commands. The hosted URL/hostname and required variable names were saved as an environment draft; hosted credentials are still not injected into the running machine. Hosted migration, hosted auth, and email delivery remain unverified. Privileged credentials shared in chat must be rotated and configured securely before hosted validation.

## Step 1.3 project screens and manual entry

The local database applies `0002_project_summaries.sql` through `supabase migration up --local`. The view uses `security_invoker` so project and cost-item RLS both apply. Totals include all matching-currency rows in SQL; the live anon-key RLS test verifies totals across 1,006 items and confirms B cannot query A's summary. Mixed-currency items are counted but excluded from the project's currency totals, with a notice on the card.

`npm run lint`, `npm run typecheck`, `node scripts/test-local-rls.mjs --all` and the production build pass. The current unit/database suite has 51 passing tests, zero skips with local bindings. New tests cover project/cost validation, decimal precision and calendar dates, filtering/sorting, zero-estimate progress, ownership guards, cross-project row scoping, protected provenance/currency, and fetching batches even with a reduced backend cap. `tests/unit/migration.test.ts` applies both migrations and checks view ownership and mixed currencies.

`tests/e2e/projects.spec.ts` uses real local Supabase users at 1440px and 390px. It creates projects, validates empty names and negative costs, adds/edits/deletes rows, verifies reloaded and stored values, checks manual source_id=null, checks blank variance cells, renames projects, paginates 55 rows at 50 per page, sorts numeric amounts, combines search and group/category filters, verifies SQL card totals and status, changes project currency selection, uses the populated switcher, cancels/confirms deletion, and checks cascaded rows. Generated fixtures are removed by deleting only the test user. Card screenshots include both themes. All browser suites also retain signup/login/logout and signed-out route protection coverage.

To rerun everything locally: `node scripts/test-local-rls.mjs --all`, then `node scripts/test-local-rls.mjs --browser`. Use `--e2e` instead of `--browser` to rerun only the browser tests against an unchanged existing production build. Never run the dev server against the same `.next` directory during builds or production tests.

The cost table performs search, sort and 50-row pagination on a fully batched server-loaded project dataset. It renders at most 50 saved rows at a time, with an independently scrollable table and sticky header. This is suitable for the current workflow; very large projects should move filtering/pagination to the server in a later scaling step. Variance calculations remain intentionally unimplemented until Step 1.7. Hosted validation remains dependent on secure environment configuration; this step introduces no new environment variables.

Final Step 1.3 browser rerun: 8 tests passed, zero skipped with local bindings. Screenshots saved in `docs/screenshots/1.3-*.png` show project cards in both themes and the scrollable table at both widths. Final generated test-user count was zero. Historical Step 1.2 screenshots were preserved. Build, lint, strict typecheck, all 51 unit/database tests, and whitespace checks pass.

## Step 1.3 acceptance revalidation

See `docs/validation-1.3.md` for the latest evidence, corrections, and screenshot manifest. Current results supersede the earlier 55-row fixture and test counts: 120 seeded rows, 60 unit/database tests passed, and 10 real-local browser tests passed with no skips. Invalid client/server inputs, HTTP 404 for cross-user access, reload persistence and all screenshot states are covered.

## Steps 1.4 and 1.5

Structured fixtures, parse API limits/options, executable/ZIP/DTD/size/row attacks, and the real local-Supabase wizard are covered by imports.test.ts, importRoute.test.ts and imports.spec.ts. Step 1.4 passed all 96 then-current unit/database tests and all 12 then-current browser tests. SheetJS was installed from its current official tarball after its hostname became reachable.

Step 1.5 adds urlGuard.test.ts (public/private address, mixed DNS, pinned target, redirect/rebinding/header, timeout and response/decompression limits), sourceEncryption.test.ts (real AES-GCM roundtrip/context/tamper/missing-key checks), onlineImports.test.ts (Google export conversion, JSON/CSV reuse and HTML selection), and onlineRoute.test.ts (ownership, no-write default, ciphertext-only storage/update, invalid body and missing-key failure). online.spec.ts verifies actual private-URL rejection and mapping handoff using explicitly controlled public-source API responses, at both viewport widths. These are not presented as live internet successes.

The three opt-in publicSources.test.ts checks were actually run and failed with the managed proxy's HTTP 403 Domain forbidden at pinned-IP CONNECT. They remain an external blocker despite saved hostname/public-IP draft additions. The normal offline suite reports those three tests as skipped; it does not count them as passes. The latest full deterministic run passed 143 unit/database tests and 14 browser tests; build, lint and typecheck passed. See docs/imports.md for reproduction, environment setup and the exact distinction between controlled/local and live verification. No screenshots are generated unless the explicit capture flag is set.

Final follow-up: all 143 deterministic unit/database tests and all 14 browser tests pass on the final production build; the structured-import navigation assertion explicitly waits for the import route and its targeted desktop/mobile rerun also passes. The three real public-source tests remain separately recorded as proxy-policy failures, not successful imports. Runtime startup/network/encryption requirements were saved to the environment draft for review. No screenshots were generated in Steps 1.4–1.5.

Latest Step 1.5 rerun (2026-10-27): the real public-source suite now passes JSONPlaceholder (200 rows, 4 columns) and W3C HTML (3 rows, 3 columns). Google Sheets alone still fails at the environment proxy CONNECT policy. This supersedes the earlier three-failure network observations above. The 47 focused online/security tests and all 143 deterministic unit/database tests pass; the ordinary suite explicitly skips the 3 opt-in network tests.

Step 1.6 adds 26 mapping/commit/transaction tests and desktop/mobile end-to-end import coverage, including all structured fixtures, unusual headings, saved template reuse, inline fixes, source-scoped replacement and a 501-row import. Run `COSTLENS_LIVE_ONLINE=1 node scripts/test-local-rls.mjs --browser` to also exercise real JSON and HTML imports through the UI and database. See [the Step 1.6 validation report](validation-1.6.md) for results, configuration and remaining scope. Google Sheets live checks are excluded by request.

Step 1.7 adds `calc.test.ts` for all six pure calculation APIs and updates computed-sort assertions in `costs.test.ts`. `calculations.spec.ts` verifies imported CodeAudit variance, signed colours/icons, status boundaries, zero/missing amounts, sorting, reloads, dark mode and invalid-preview safety on desktop/mobile. See [calculation semantics and expected CodeAudit figures](calculations.md). Routine browser validation skips the two explicitly opt-in real-network tests; prior live import validation is recorded separately.

Step 1.8 adds `dashboard.test.ts` and `dashboard.spec.ts`. They cover shared URL filters, currency/missing-value behavior, sparse grouped cumulative series, CodeAudit KPIs, chart tooltips, keyboard selection, view grouping, reload/share/Back/Forward state, SVG theme changes and empty/undated views on desktop and mobile. See [dashboard behavior](dashboard.md). The local runner forwards browser test paths/options after `--`, allowing a focused run without printing local test credentials. Live online-source tests remain explicitly opt-in and are unrelated to dashboard rendering.
