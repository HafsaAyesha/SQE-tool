import { describe, expect, it } from 'vitest';
import { formatMoney, formatPercent } from '@/lib/format';
describe('shared cost formatting', () => {
  it('formats project currencies, zero, and negative costs', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-25)).toBe('-$25.00');
  });
  it('formats ratios as percentages including negative variance', () => {
    expect(formatPercent(-0.125)).toBe('-12.5%');
    expect(formatPercent(0.125)).toBe('12.5%');
    expect(formatPercent(-0.1328)).toBe('-13.3%');
    expect(formatPercent(0)).toBe('0%');
  });
});
