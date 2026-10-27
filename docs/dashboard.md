# Project dashboard — Step 1.8

`/projects/[id]` keeps its server ownership check and cost loader, then renders `ProjectDashboard` above the existing editable CostTable. Five KpiCards show estimated, actual, signed variance, signed percentage and over-band item count. All arithmetic remains in calc.ts; `lib/costs/dashboard.ts` only validates/filter queries, prepares labels and aligns already-computed cumulative points.

## Shared view state

The URL holds optional `source`, `category`, `from`, `to`, `group`, `q`, `by` and `focus` parameters. `by` defaults to category so the initial donut shows actual cost by category. Group, Category, Source and Month update every chart: the comparisons and donut use that dimension, while burn-up lines show cumulative series for those keys. Source keys are stable source IDs with readable names in the UI.

Source/category/date filters, group filtering and item search apply to KPIs, every chart and the table together. Date boundaries are inclusive and exclude undated rows when either boundary is set. Filters use Next.js native-history integration, so changing a view does not refetch unchanged project data; reloads, shared URLs and browser Back/Forward restore the same values. Typing a search replaces the current history entry; discrete selections push an entry. Unknown unrelated query parameters are retained. Zod validates known query values; malformed dates, invalid source IDs and reversed ranges are ignored with a visible explanation.

Clicking or pressing Enter/Space on a bar sets `focus` and narrows only the table to that summary key. A focus banner explains the difference and can clear it. Changing any ordinary filter or grouping clears chart focus. The table keeps its sorting, pagination and edit/delete/add actions; its standalone local filter controls are hidden on the dashboard to avoid duplicate filters. Import previews continue to use the original standalone table controls.

Money KPIs/charts aggregate only the project currency, using calc.ts without converting units. Other-currency rows remain in the table with an explicit exclusion count. Missing amounts retain calc.ts's known-amount sum behavior and a visible missing-count note. Empty projects link to their import wizard and still allow manual rows; no-match filters offer a reset. Undated views show an explanation in place of the burn-up SVG.

## Reusable charts

All four chart components live in `components/costlens/charts/`, accept data/currency/dimension props, and contain no project fetching or dashboard URL hooks. Animations are disabled for stable display and future report capture. Theme CSS variables colour SVGs, so next-themes updates them without a reload. Each chart has a labelled region/title, legends and formatted-money tooltips. Bar SVG shapes are keyboard-operable when onSelect is supplied; comparison charts and the cumulative line also provide expandable data tables.

- **EstimatedVsActualBar:** grouped estimated/actual bars. At high cardinality, it shows the first 20 keys with a disclosure; all keys remain in the accessible data table and KPIs/table.
- **VariancePctBar:** horizontal percentage bars, highest first, rose above zero and emerald below, with a zero reference line and signed legend. Undefined percentages are excluded from the plot with a count; all summaries remain in chart data. It shows up to the 20 highest defined percentages.
- **BurnUpLine:** calc.ts produces cumulative points for each selected grouping key. The component aligns sparse dates and carries existing balances forward, without adding money itself. Up to four leading keys plus an Other series preserve every dated amount without an unreadable number of lines. Estimated lines are dashed, actual lines solid. Date filters restart accumulation for the selected view; undated rows remain in other dashboard totals.
- **CostShareDonut:** initially actual share by category; other Group by choices change its dimension. Positive net key totals provide valid pie weights. Zero/negative totals are omitted with a note, while credits remain in KPIs/table and other charts. Its centre and legend sum/percentages refer to the positive-share portion. An accessible legend can focus the table.

For reports, import the same components directly, supply precomputed `ChartDatum[]` (calc Summary plus display label) or BurnSeries points, currency and the same dimensions. Omit onSelect for a static rendering. The report capture container must supply a real width; the charts have fixed internal heights and responsive width. This step does not implement image export or the later report route.

`ProjectDashboard` has an optional insights ReactNode slot. When supplied in Phase 2, it appears in a right-hand column on 2xl screens and stacks below the main content at smaller widths. No empty AI placeholder is shown now.

## Validation and configuration

`dashboard.test.ts` covers query validation/roundtrips, combined and inclusive filters, currency safety, aggregate consistency, table-only focus, sparse date alignment, high-cardinality overflow and user-key collisions. `dashboard.spec.ts` verifies CodeAudit KPIs, all four SVGs, formatted tooltips, percentage sorting/zero line, keyboard bar focus, group/source/month switches, combined filters, shared links/reloads/Back/Forward, live SVG recolouring, mobile overflow, missing dates/amounts/currency, malformed URLs and empty-project imports. Tests use real local Supabase and generated users, cleaned in finally blocks. No screenshots are generated.

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Focused browser run using the existing production build:
node scripts/test-local-rls.mjs --e2e -- tests/e2e/dashboard.spec.ts
```

No new environment variables or Supabase migrations are required. Existing auth/project/source migrations remain prerequisites.
