// Hierarchical sort by indicator code, e.g.:
// OBJ1, KPI1, QI1.1, QI1.2, ..., KPI2, QI2.1, SUB2.1.1, SUB2.1.2, ...

const LEVEL_RANK: Record<string, number> = {
  objective: 1,
  kpi: 2,
  qi: 3,
  subqi: 4,
};

function numericPath(code: string): number[] {
  const m = code.match(/([\d.]+)/);
  if (!m) return [];
  return m[1].split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
}

export function compareIndicators(
  a: { code: string; level?: string | null },
  b: { code: string; level?: string | null },
): number {
  const pa = numericPath(a.code);
  const pb = numericPath(b.code);
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  if (pa.length !== pb.length) return pa.length - pb.length;
  const ra = LEVEL_RANK[a.level ?? ""] ?? 99;
  const rb = LEVEL_RANK[b.level ?? ""] ?? 99;
  if (ra !== rb) return ra - rb;
  return a.code.localeCompare(b.code);
}

export function sortIndicators<T extends { code: string; level?: string | null }>(list: T[]): T[] {
  return [...list].sort(compareIndicators);
}
