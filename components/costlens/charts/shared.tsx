'use client';
import { useId } from 'react';
import { Rectangle } from 'recharts';
import type { Summary } from '@/lib/costs/calc';
import { formatMoney, formatPercent } from '@/lib/format';
export type ChartDatum = Summary & { label: string };
export const chartColors = ['var(--chart-estimated)', 'var(--chart-actual)', 'var(--warn)', 'var(--chart-violet)', 'var(--under)'];
export function ChartFrame({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"><h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2><p className="mb-5 mt-1 text-xs leading-5 text-muted-foreground">{description}</p>{children}{footer}</section>;
}
export function chartMoney(value: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value); }
export const shortLabel = (value: string) => value.length > 17 ? value.slice(0, 16) + '…' : value;
export function ChartTooltip({ active, payload, label, currency, percent = false }: { active?: boolean; payload?: readonly { name?: string | number; value?: string | number; color?: string; payload?: ChartDatum }[]; label?: string | number; currency: string; percent?: boolean }) {
  if (!active || !payload?.length) return null;
  const record = payload[0].payload;
  return <div className="max-w-72 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg"><p className="mb-2 break-words font-semibold">{record?.label ?? label}</p>{payload.map((entry, index) => <p key={index} className="flex justify-between gap-4 py-1"><span>{entry.name}</span><strong className="tabular-nums">{typeof entry.value === 'number' ? percent ? formatPercent(entry.value / 100) : formatMoney(entry.value, currency) : 'n/a'}</strong></p>)}{percent && record && <div className="mt-2 border-t pt-2"><p>Estimated: {formatMoney(record.estimated, currency)}</p><p>Actual: {formatMoney(record.actual, currency)}</p></div>}</div>;
}
/** Real keyboard-operable SVG bars; the optional callback is omitted by report consumers. */
export function InteractiveBar({ shape, onSelect, metric }: { shape: unknown; onSelect?: (key: string) => void; metric: string }) {
  const props = shape as { x?: number; y?: number; width?: number; height?: number; fill?: string; payload?: ChartDatum };
  const datum = props.payload;
  return <Rectangle x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} radius={3} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={datum ? `Filter table to ${datum.label}: ${metric}` : metric} className={onSelect ? 'cursor-pointer outline-offset-2 focus:outline-2 focus:outline-ring' : undefined} onClick={() => { if (datum) onSelect?.(datum.key); }} onKeyDown={event => { if (datum && onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(datum.key); } }}/>;
}
export function SummaryData({ data, currency }: { data: readonly ChartDatum[]; currency: string }) {
  return <details className="mt-4 border-t pt-3 text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm">View chart data</summary><div className="mt-3 max-h-56 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Accessible chart values</caption><thead><tr><th scope="col">Key</th><th scope="col">Estimated</th><th scope="col">Actual</th><th scope="col">Variance</th><th scope="col">% variance</th></tr></thead><tbody>{data.map(row => <tr key={row.key}><th scope="row" className="p-2 text-left font-medium">{row.label}</th><td className="p-2 tabular-nums">{formatMoney(row.estimated,currency)}</td><td className="p-2 tabular-nums">{formatMoney(row.actual,currency)}</td><td className="p-2 tabular-nums">{formatMoney(row.variance,currency)}</td><td className="p-2 tabular-nums">{row.variancePct === null ? 'n/a' : formatPercent(row.variancePct/100)}</td></tr>)}</tbody></table></div></details>;
}
