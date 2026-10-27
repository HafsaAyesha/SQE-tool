/** Spreadsheet consumers must treat formula-like text as literal text. */
export function escapeFormula(value: string): string {
  return /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? "'" + value : value;
}
