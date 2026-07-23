// Shared status/tone helpers for KPI/QI values

export type Tone = "green" | "yellow" | "red" | null;

export function toneFor(
  v: number | null | undefined,
  target: number | null | undefined,
  cond: string | null | undefined,
  inverted: boolean | null | undefined,
): Tone {
  if (v == null || target == null) return null;
  const diff = v - target;
  if (inverted || cond === "lte") {
    if (v <= target) return "green";
    if (diff <= 2) return "yellow";
    return "red";
  }
  if (cond === "eq") {
    // exact-target rule (per mockup): pass only when value matches target
    if (Math.abs(diff) < 0.001) return "green";
    return "red";
  }
  if (v >= target) return "green";
  if (diff >= -2) return "yellow";
  return "red";
}

export function statusLabel(t: Tone): string {
  return t === "green" ? "ผ่าน" : t === "yellow" ? "ใกล้เกณฑ์" : t === "red" ? "ไม่ผ่าน" : "—";
}

export function statusBadgeClass(t: Tone): string {
  return t === "green"
    ? "bg-emerald-600 hover:bg-emerald-600 text-white"
    : t === "yellow"
      ? "bg-amber-500 hover:bg-amber-500 text-white"
      : t === "red"
        ? "bg-rose-600 hover:bg-rose-600 text-white"
        : "bg-muted text-muted-foreground";
}

export function targetSymbol(c: string | null | undefined): string {
  return c === "lte" ? "≤" : c === "eq" ? "=" : "≥";
}
