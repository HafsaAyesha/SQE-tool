import Decimal from 'decimal.js';
/** Private configuration: never alter Decimal's process-wide defaults. */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Amounts = { estimated: number | null; actual: number | null };
export type CalculationRow = Amounts & {
  currency?: string; group?: string | null; category?: string | null; date?: string | null;
  sourceId?: string | null; sourceName?: string | null; source?: string | null; type?: string;
};
export type CostStatus = 'under' | 'on' | 'over' | 'unknown';
export type SummaryBy = 'group' | 'category' | 'source' | 'month';
export type Summary = { key: string; estimated: number; actual: number; variance: number; variancePct: number | null; count: number; overCount: number };
export type Totals = { estimated: number; actual: number; variance: number; variancePct: number | null; overCount: number; itemCount: number; missingCount: number };
function money(value: number): Decimal {
  if (!Number.isFinite(value)) throw new RangeError('Cost amounts must be finite numbers.');
  const amount = new D(value);
  if (amount.abs().gt('999999999999.99')) throw new RangeError('Cost amounts exceed the supported monetary range.');
  return amount.toDecimalPlaces(2);
}
function number(value: Decimal): number {
  const result = value.toNumber();
  // Public APIs return numbers. Refuse a total that would silently lose cents at that boundary.
  if (!Number.isFinite(result) || !new D(result).eq(value)) throw new RangeError('The monetary result is too large to represent accurately as a number.');
  return result === 0 ? 0 : result;
}
function difference(row: Amounts): Decimal | null {
  return row.estimated == null || row.actual == null ? null : money(row.actual).minus(money(row.estimated));
}
function percentage(variance: Decimal, estimated: Decimal): number | null {
  return estimated.isZero() ? null : variance.div(estimated).times(100).toNumber();
}
export function rowVariance(row: Amounts): number | null {
  const value = difference(row); return value === null ? null : number(value);
}
/** Percentage points, e.g. 25 means 25%; null for a missing or zero estimate. */
export function rowVariancePct(row: Amounts): number | null {
  const value = difference(row); return value === null ? null : percentage(value, money(row.estimated!));
}
/** Inclusive ±band% is on target. A zero baseline uses the absolute variance direction. */
export function status(row: Amounts, band = 5): CostStatus {
  if (!Number.isFinite(band) || band < 0) throw new RangeError('The status band must be a nonnegative finite percentage.');
  const variance = difference(row); if (variance === null) return 'unknown';
  const tolerance = money(row.estimated!).abs().times(band).div(100);
  return variance.gt(tolerance) ? 'over' : variance.lt(tolerance.negated()) ? 'under' : 'on';
}
function singleCurrency(rows: readonly CalculationRow[]) {
  if (new Set(rows.map(row => row.currency).filter(Boolean)).size > 1) throw new RangeError('Aggregate one currency at a time; convert or filter mixed-currency rows first.');
}
function aggregate(rows: readonly CalculationRow[]) {
  let estimated = new D(0), actual = new D(0), overCount = 0, missingCount = 0;
  for (const row of rows) {
    if (row.estimated != null) estimated = estimated.plus(money(row.estimated));
    if (row.actual != null) actual = actual.plus(money(row.actual));
    if (row.estimated == null || row.actual == null) missingCount++;
    if (status(row) === 'over') overCount++;
  }
  const variance = actual.minus(estimated);
  return { estimated: number(estimated), actual: number(actual), variance: number(variance), variancePct: percentage(variance, estimated), overCount, itemCount: rows.length, missingCount };
}
/** Sums each known amount independently; missing amounts contribute zero and are counted. */
export function totals(rows: readonly CalculationRow[]): Totals {
  singleCurrency(rows); return aggregate(rows);
}
function validDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError('Cost dates must be valid ISO calendar dates.');
  return value;
}
export function summaryKey(row: CalculationRow, by: SummaryBy): string {
  switch (by) {
    case 'group': return row.group?.trim() || 'Ungrouped';
    case 'category': return row.category?.trim() || 'Uncategorised';
    // IDs distinguish different sources with identical names. Source metadata is optional on CostRow.
    case 'source': return row.sourceId ?? row.source ?? row.sourceName ?? (row.sourceId === null || row.type === 'manual' ? 'Manual' : row.type || 'Unknown source');
    case 'month': return row.date ? validDate(row.date).slice(0, 7) : 'Undated';
  }
}
export function summarise(rows: readonly CalculationRow[], by: SummaryBy): Summary[] {
  singleCurrency(rows);
  const groups = new Map<string, CalculationRow[]>();
  for (const row of rows) { const key = summaryKey(row, by); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, group]) => {
    const { estimated, actual, variance, variancePct, itemCount: count, overCount } = aggregate(group);
    return { key, estimated, actual, variance, variancePct, count, overCount };
  });
}
/** Undated rows are omitted; same-day costs are combined before accumulating, in ISO-date order. */
export function cumulativeByDate(rows: readonly CalculationRow[]): { date: string; cumEstimated: number; cumActual: number }[] {
  singleCurrency(rows);
  const dates = new Map<string, { estimated: Decimal; actual: Decimal }>();
  for (const row of rows) {
    if (!row.date) continue;
    const date = validDate(row.date); const bucket = dates.get(date) ?? { estimated: new D(0), actual: new D(0) };
    if (row.estimated != null) bucket.estimated = bucket.estimated.plus(money(row.estimated));
    if (row.actual != null) bucket.actual = bucket.actual.plus(money(row.actual));
    dates.set(date, bucket);
  }
  let estimated = new D(0), actual = new D(0);
  return [...dates].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([date, bucket]) => {
    estimated = estimated.plus(bucket.estimated); actual = actual.plus(bucket.actual);
    return { date, cumEstimated: number(estimated), cumActual: number(actual) };
  });
}
