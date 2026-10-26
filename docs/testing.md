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
