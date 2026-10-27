# Step 1.7 validation — 2026-10-27

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Row variance and percentage | Decimal, positive/negative, zero/missing input assertions | PASS | tests/unit/calc.test.ts row calculations |
| Status and configurable band | Inclusive ±5%, smaller bands, zero and negative estimates | PASS | calc.test.ts boundary/credit tests |
| Summary dimensions and counts | Group, category, source and month; weighted totals | PASS | calc.test.ts totals and summaries |
| Totals precision and missing counts | 5,000 small amounts, decimal cancellation, missing-side totals, oversized exact-number boundary | PASS | calc.test.ts precision and totals tests |
| Cumulative dates | Unsorted/duplicate/undated/leap/invalid dates, exact running sums | PASS | calc.test.ts date accumulation |
| Pure functions | Frozen input arrays/rows and unchanged global Decimal defaults | PASS | calc.test.ts immutability test |
| Shared calculation implementation | Table/render/sort imports and repository search | PASS | lib/costs/calc.ts; lib/costs/table.ts; CostTable.tsx |
| Correct CodeAudit table | Actual CSV parsed/committed; signed values, arrows, status and sorting | PASS | tests/e2e/calculations.spec.ts, desktop/mobile |
| Zero/missing amounts and invalid previews | n/a/unknown, monetary em dash, sort on rejected oversized amount | PASS | calculations.spec.ts |
| Light/dark and mobile layout | Initial/dark UI assertions, viewport overflow check | PASS | calculations.spec.ts, 1440px and 390px |
| Build/lint/typecheck | npm scripts | PASS | production build; npm run lint; npm run typecheck |
| Unit/database suite | Real local Supabase runner | PASS | 185 passed, 3 opt-in public-network tests explicitly skipped |
| Browser suite | Production app and real local Supabase | PASS | 18 passed, 2 opt-in live-network tests explicitly skipped |

Commands:

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# After replacing old Step 1.3 blank-cell assertions, reuse the unchanged production build:
node scripts/test-local-rls.mjs --e2e
```

The initial browser run failed only because the old project test asserted empty variance cells. It now asserts -$20.00, -20% and Under budget, and the full browser suite was rerun. The new CodeAudit calculation tests passed at both widths. Live internet tests are unrelated to pure arithmetic and were not enabled; skips are not counted as passes. No screenshots were captured. Generated local users are cleaned up.

See [calculation semantics](calculations.md) for missing-value aggregation, overCount band policy, source labels, currency protection and precision limits. All requested calculation functions have behavioral coverage; no Step 1.7 acceptance gaps remain. No environment variables or migrations are added.

Files added: lib/costs/calc.ts; tests/unit/calc.test.ts; tests/e2e/calculations.spec.ts; docs/calculations.md; this report. Updated: lib/costs/table.ts; CostTable.tsx; ImportMapping.tsx (invalid-amount calculation safety); costs.test.ts; projects.spec.ts; package.json/lock (decimal.js); README.md and docs/testing.md.

Step 1.7: READY.
