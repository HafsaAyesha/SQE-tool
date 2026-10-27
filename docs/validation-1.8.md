# Step 1.8 validation — 2026-10-27

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Five dashboard KPIs from calc.ts | Real CodeAudit project and exact displayed values | PASS | dashboard.spec.ts: estimated $3,300; actual $3,130; variance -$170; -5.2%; 1 of 3 over band |
| Four responsive charts with titles/tooltips/legends | SVG presence, formatted $80 tooltip, percentage order/zero line, cumulative and share views | PASS | dashboard.spec.ts; components/costlens/charts/ |
| Group by drives every chart | Group/source/month changes, grouped burn-up labels and donut legend | PASS | dashboard.spec.ts; burnSeries/alignBurnSeries unit tests |
| Source/category/date filters apply everywhere | Combined filters with exact KPIs and table counts; source/category/date model tests | PASS | dashboard.spec.ts; dashboard.test.ts |
| Shareable URLs and history | Reload, second page with same URL, Back/Forward, query validation/roundtrips | PASS | dashboard.spec.ts; dashboard.test.ts |
| Bar selection narrows only table | Keyboard Enter, URL focus, unchanged full-view KPI and narrowed table | PASS | dashboard.spec.ts; dashboard.test.ts focus model |
| Light/dark/mobile presentation | SVG computed fill changes live, both themes, no document overflow at 1440px/390px | PASS | dashboard.spec.ts desktop/mobile |
| Empty/no-match/undated cases | Import link, manual Add row, reset filters, no burn-up SVG, explanatory empty state | PASS | dashboard.spec.ts |
| Currency/missing amount safety | Project-currency KPIs/charts; retained foreign rows; missing-count/n/a behavior | PASS | dashboard.spec.ts; dashboard.test.ts |
| Loading and future reuse | Loading route/Skeleton component, chart data props without project hooks, optional wide insights slot | PASS | projects/[id]/loading.tsx; DashboardSkeleton.tsx; charts/; ProjectDashboard.tsx |
| Build/lint/typecheck | Production build and npm scripts | PASS | npm run build; npm run lint; npm run typecheck |
| Unit/database regression suite | Local Supabase runner | PASS | 194 passed; 3 opt-in public-network checks explicitly skipped |
| Browser regression suite | Production build and real local Supabase, desktop/mobile | PASS | 20 passed; 2 opt-in live import checks explicitly skipped |

Commands:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Targeted iterations reused the production build:
node scripts/test-local-rls.mjs --e2e -- tests/e2e/dashboard.spec.ts
# Final complete regression run:
node scripts/test-local-rls.mjs --e2e
```

The first new browser test matched legend SVGs along with the main chart SVG; its selector now targets the main chart directly. A second run exposed an incomplete test fixture: bulk insertion of an EUR row and an omitted-USD row produced a null currency via PostgREST. The fixture now explicitly supplies USD. Neither required weakening production validation. The final focused and full browser suites pass, with no page errors. Live external-source checks are unrelated to dashboard rendering and were not counted as passes. Routine validation created no screenshots.

Implementation connections: all variance arithmetic stays in calc.ts, which now exports summaryKey so chart focus and grouping use exactly the same key policy. dashboard.ts is a pure query/filter/chart-data model. Reusable chart props and the optional insights slot are documented in [dashboard.md](dashboard.md), including high-cardinality display caps, Other cumulative series, credit handling and future report capture sizing. Image export and the actual AI panel remain their later requested steps.

Files added: ProjectDashboard.tsx, KpiCard.tsx, DashboardSkeleton.tsx; charts/shared.tsx, EstimatedVsActualBar.tsx, VariancePctBar.tsx, BurnUpLine.tsx, CostShareDonut.tsx; lib/costs/dashboard.ts; project loading.tsx; dashboard unit/browser tests; dashboard.md and this report. Files updated: project page.tsx, CostTable.tsx, calc.ts (shared key export), globals.css (chart theme tokens), local test runner (targeted browser args), README and testing docs.

No new environment variables, dependencies or Supabase migrations are required. Existing project/auth/import setup remains in use. No Step 1.8 acceptance gaps remain for the CodeAudit dashboard; large-key plotting policies and later report/AI functionality are explicitly documented rather than claimed as implemented exports/panels.

Step 1.8: READY.
