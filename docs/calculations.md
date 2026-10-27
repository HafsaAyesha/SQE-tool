# Shared cost calculations — Step 1.7

`lib/costs/calc.ts` is the sole implementation of cost variance, percentage variance, status, summaries, totals and cumulative amounts. It has no database, network, browser, clock or mutation side effects. CostTable and its sort transform call these functions; future dashboard, anomaly and report code must call the same module.

## Public contract

- `rowVariance({estimated, actual})`: actual − estimated, or null if either is missing.
- `rowVariancePct(row)`: percentage points, e.g. 25 means 25%, or null for a missing actual/estimate or a zero estimate. The formatter accepts a ratio, so the table divides percentage points by 100 for display only.
- `status(row, band=5)`: unknown for a missing amount; on for the inclusive ±band% interval; otherwise under/over according to the variance direction. Band must be nonnegative and finite. A known zero estimate is on only when actual is zero, otherwise actual's direction determines under/over. Negative baseline credits use the absolute estimate for the status band; percentage variance retains the explicitly requested signed-denominator formula.
- `summarise(rows, by)`: sorted groups with key, estimated, actual, variance, variancePct, count and overCount. Group/category blank values use Ungrouped/Uncategorised; undated month rows use Undated. Source keys prefer sourceId (so identical names remain distinct), then explicit source, sourceName or type; known manual rows use Manual and missing provenance uses Unknown source. Source names can be resolved from IDs by the consuming view.
- `totals(rows)`: estimated, actual, variance, variancePct, overCount, itemCount and missingCount. Known amounts on each side sum independently; missing amounts contribute zero, and missingCount counts each row with either amount absent once. Aggregate variance is the difference of those known-amount sums, not the sum of only paired row variances. Consumers should show missingCount alongside incomplete totals. Empty input returns zero sums/counts and null percentage. overCount counts rows with status over under the default 5% band, rather than every positive variance.
- `cumulativeByDate(rows)`: date-sorted daily points, combining duplicate dates before running sums. Missing amounts contribute zero; undated rows are omitted. Invalid calendar dates fail explicitly. Month summaries retain undated rows, unlike a dated cumulative line.

All aggregate functions require a single currency. Mixed-currency arrays fail explicitly; filter to project currency or convert amounts before calling, rather than adding different units. Row calculations require no provenance, currency or other UI fields; aggregation accepts the standard CostRow plus optional source metadata, including CostTableRow.

## Precision

The private decimal.js constructor uses decimal arithmetic and its own rounding/precision configuration; global Decimal defaults are unchanged. Inputs are rounded once to cents, half up, matching the two-decimal cost model (validated imported/manual rows already have at most two decimals). Sums and differences stay decimal until the public number boundary. Negative zero is normalized. Non-finite/out-of-model amounts fail explicitly, and a monetary aggregate too large to round-trip to a JavaScript number without losing cents throws instead of silently dropping money. Percentage divisions may recur; they return normal numeric percentage points and are rounded for display by the shared formatter.

## Table integration

CostTable fills both variance columns, using explicit signs and up/down icons alongside rose/emerald tokens. Zero is neutral; undefined percentages display n/a and missing monetary variance displays an em dash. Status badges have readable labels (Under budget, On target, Over budget, Unknown). Status and both variance columns can be sorted. The inclusive status band is separate from a signed variance: a +1% variance is rose but still On target.

The same read-only component serves import previews. Invalid amounts are normalized to null only for preview display/calculation while the original candidate value remains in the correction editor. This prevents sorting an invalid, oversized amount from invoking arithmetic on rejected data. Invalid rows show Unknown status and unavailable variance as appropriate. Existing inline row editors have a matching status cell and correct column spans.

## CodeAudit expected results

| Item | Estimated | Actual | Variance | % variance | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Development | 3000 | 2800 | -200 | -6.666…% | under |
| Cloud hosting | 100 | 80 | -20 | -20% | under |
| AI API | 200 | 250 | +50 | +25% | over |

Totals: estimated 3300, actual 3130, variance -170, percentage -5.151515…%, overCount 1, itemCount 3, missingCount 0.

Tests: `tests/unit/calc.test.ts` covers precision, status boundaries, zero/missing/negative values, all grouping modes, currency protection, duplicate/invalid dates, cumulative values and immutability. `costs.test.ts` additionally verifies real calculated sorting and null ordering. `tests/e2e/calculations.spec.ts` imports the actual CSV through the guarded parse/commit APIs, checks table values/signs/icons/status/sorting in both viewport widths and dark mode, and exercises computed sorting on an invalid import preview. Routine validation does not generate screenshots.

No environment variables or database migrations are added by Step 1.7.
