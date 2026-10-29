# Step 2.6 validation

Validated against a production Next.js build and a disposable local Supabase/Redis environment. Hosted deployment is separate.

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Branded preview, options and dashboard Export link | Desktop/mobile browser flow | PASS | tests/e2e/insightsReports.spec.ts |
| PDF cover, owner/sources, KPIs, four charts, summaries, anomalies, AI disclaimer, appendix and page numbers | Actual PDF renderer, extracted page text, rasterized Recharts and visual review of CodeAudit cover/charts | PASS | tests/unit/report.test.ts; docs/samples/codeaudit-report.pdf |
| Editable Excel variance formulas and five styled sheets | Round-trip ExcelJS, formula references/results, frozen headers, formats, OOXML fullCalcOnLoad | PASS | tests/unit/report.test.ts; docs/samples/codeaudit-report.xlsx |
| Formula injection prevented in CSV/Excel | Formula-like item/group/note strings remain escaped literal cells; computed negative numbers retained | PASS | tests/unit/report.test.ts |
| Owner authorization and distributed export limit | Route tests and real Redis-backed limiter, HTTP 429/Retry-After | PASS | tests/unit/reportRoutes.test.ts; tests/unit/rateLimit.test.ts |
| Downloads use authoritative data and current AI cache | Browser downloads actual PDF/XLSX/CSV, cached-only gateway, data snapshot hash check | PASS | tests/e2e/insightsReports.spec.ts; lib/report/load.ts |

Changed files: app/(app)/projects/[id]/report/{page,loading}.tsx; app/api/projects/[id]/report.{pdf,xlsx,csv}/route.ts; components/costlens/ReportPreview.tsx; ProjectActions.tsx; lib/report/*; lib/security/rateLimit.ts; app/globals.css; next.config.js; app/fonts/Inter-{Regular,Bold}.ttf; package.json/package-lock.json; report unit/route/browser tests; docs/reports.md; docs/samples/*.

Connections: aggregates and variance use calc.ts, anomaly rules use anomalies.ts, the AI section uses the validated private summary cache through the shared gateway, and the preview reuses dashboard chart components. Server PDF charts use Recharts rendered in memory. Every export authorizes the project and consumes the report limiter. GET downloads never trigger paid generation.

Configuration: no new environment variables. Existing Supabase and Upstash settings are required; optional AI requires the existing Gemini setup and a generated summary. Apply pending migrations, including 0007 summary-cache invalidation, to the hosted Supabase before deployment. Local migrations are applied; hosted application is not claimed.

Gaps: no graphical Excel application is available here, so desktop Excel opening is not claimed. Actual workbook formulas, cached results and recalculation settings are verified. Sample exports use synthetic public CodeAudit data and contain no real account information. Preview appendix displays up to 500 rows; downloads include all selected rows, subject to a 10,000-item project safety limit.

Validation commands/results:

- `npm run lint`: PASS (zero warnings).
- `npm run typecheck`: PASS.
- `npm --prefix worker run build`: PASS.
- `node scripts/test-local-rls.mjs --all` (invokes `npm run test`): 295 passed, six explicitly opt-in checks skipped.
- Separate opt-in real-Gemini run: 298 passed, three external-source checks skipped; real JSON/cache, receipt vision and cost-summary tests passed.
- `node scripts/test-local-rls.mjs --browser` (invokes build and `npm run test:e2e`): production build PASS; 32 browser tests passed, two opt-in live-network tests skipped, at 1440px and 390px.
- Final PDF chart-key change: nine report unit/route tests passed; sample PDF regenerated and visually reviewed. Final production rebuild and both targeted desktop/mobile report browser tests also passed.
- `git diff --check`: PASS. Recognizable secret-pattern scan: zero matching files; built browser assets contain none of the private-key environment names checked.

Step 2.6: READY locally. Hosted deployment and a graphical Excel application were not exercised.
