// Number formatting for indicator values.
// Rules (in priority order):
// 1. Explicit registry — decimals derived from the indicator's configured
//    target value (e.g. target 0.0001 → 4 decimals). Populated by pages via
//    registerIndicatorDecimals() when they load indicators.
// 2. KPI4 family (KPI4 and all its QI/Sub-QI children) always uses 4 decimals.
// 3. Everything else uses 2 decimals.

const MIN_DECIMALS = 2;
const MAX_DECIMALS = 4;

const FOUR_DECIMAL_CODES = new Set(["KPI4"]);

const registry = new Map<string, number>();

/** Number of decimals present in a numeric value (clamped to 2..4). */
export function decimalsOfValue(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return MIN_DECIMALS;
  const s = String(value);
  const idx = s.indexOf(".");
  const d = idx === -1 ? 0 : s.length - idx - 1;
  return Math.min(MAX_DECIMALS, Math.max(MIN_DECIMALS, d));
}

function isKpi4Family(code: string): boolean {
  if (FOUR_DECIMAL_CODES.has(code)) return true;
  const c = code.toUpperCase();
  return /^(QI|SUB-?QI|SUB)?4(\.|$)/.test(c.replace(/^KPI/, ""));
}

/** Register decimal settings from loaded indicators (code + target_value). */
export function registerIndicatorDecimals(
  inds: Array<{ code?: string | null; target_value?: number | null }> | null | undefined,
): void {
  if (!inds) return;
  for (const i of inds) {
    if (!i?.code) continue;
    const d = decimalsOfValue(i.target_value ?? null);
    const base = isKpi4Family(i.code) ? MAX_DECIMALS : MIN_DECIMALS;
    registry.set(i.code, Math.max(base, d));
  }
}

export function decimalsFor(code: string | null | undefined): number {
  if (!code) return MIN_DECIMALS;
  const reg = registry.get(code);
  if (reg != null) return reg;
  return isKpi4Family(code) ? MAX_DECIMALS : MIN_DECIMALS;
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

/** Format a target value using the indicator's own decimal setting. */
export function formatTargetValue(
  code: string | null | undefined,
  value: number | null | undefined,
  dash = "—",
): string {
  if (value == null || Number.isNaN(value)) return dash;
  return value.toFixed(decimalsFor(code));
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
