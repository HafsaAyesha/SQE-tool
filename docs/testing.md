# Step 1.1 validation

Unit tests cover shared money formatting (USD/EUR/JPY, zero, negative) and percent ratios, rounding and negative variance. E2E tests cover landing calls to action, placeholder auth destinations, shell pages, active navigation, system theme default, light/dark switching and persistence, mobile Sheet navigation and closing, user menu, runtime errors and horizontal overflow. Both landing and shell produce screenshots in each theme at desktop/mobile widths for visual review.

Build, lint and strict type checks cover all generated UI components. These smoke tests do not cover authentication, Supabase policies, importers or cost analysis; those features are not implemented yet. No external credentials are required at this stage.

## Acceptance rerun

All five commands passed: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (3 tests), `npm run test:e2e` (4 tests). Playwright automatically uses `/usr/bin/chromium` if present, with an explicit executable-path environment override supported; elsewhere it uses its downloaded Chromium.

Exact viewports are 1440×900 and 390×844 at device scale 1. Ten PNGs are saved in `docs/screenshots/1.1-*.png`: landing and shell in each theme at both widths, plus the open mobile menu in each theme. PNG dimensions were checked and representative screenshots reviewed. Both light and dark selections are asserted after reload.

The exact USD 1234.5 → $1,234.50 and ratio -0.125 → -12.5% assertions pass. The environment test checks the complete, empty template; Git ignores `.env`, `.env.local`, and `.env.production`; no private environment files are tracked. A repository ripgrep scan for private-key headers, common API-token formats, JWTs, and nonempty secret assignments found no matches (generated output, dependencies and the lockfile were excluded). Git reports zero committed revisions, so there is no committed history to scan. Pattern scanning does not prove the absence of every possible credential format.

Changes for validation: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `tests/unit/format.test.ts`, new `tests/unit/environment.test.ts`, this document, and ten screenshots. No application behavior changed and no additional configuration is required. Acceptance coverage gaps were filled by exact negative-percentage, environment-file protection, exact viewport, mobile menu screenshot, and light-theme persistence checks. Cross-browser validation beyond Chromium remains outside this step.
