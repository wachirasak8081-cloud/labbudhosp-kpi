// Number formatting for indicator values.
// Per spec (Dash_KPI.pdf p.3-4): KPI4, QI4.1, QI4.2 must display 4 decimals
// across the whole program. Other indicators use 2 decimals.

const FOUR_DECIMAL_CODES = new Set(["KPI4", "QI4.1", "QI4.2"]);

export function decimalsFor(code: string | null | undefined): number {
  if (!code) return 2;
  return FOUR_DECIMAL_CODES.has(code) ? 4 : 2;
}

export function formatIndicatorValue(
  code: string | null | undefined,
  value: number | null | undefined,
  opts: { suffix?: string; dash?: string } = {},
): string {
  const { suffix = "", dash = "—" } = opts;
  if (value == null || Number.isNaN(value)) return dash;
  return value.toFixed(decimalsFor(code)) + suffix;
}

export function formatDiff(
  code: string | null | undefined,
  diff: number | null | undefined,
): string {
  if (diff == null || Number.isNaN(diff)) return "—";
  const d = decimalsFor(code);
  const sign = diff >= 0 ? "+" : "";
  return sign + diff.toFixed(d);
}
