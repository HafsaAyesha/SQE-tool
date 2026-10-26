/** Deterministic locale for server/client rendering. Currency follows the project. */
export function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}
/** Receives a ratio: 0.125 is formatted as 12.5%. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
