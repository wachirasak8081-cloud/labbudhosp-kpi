// Derived value engine — computes every indicator recursively from leaf data.
// Rules:
//   - leaf: use measurement.calculated_value for the fiscal month.
//     yearly frequency carries forward the last known value in the fiscal year.
//   - non-leaf: average of active children.
//   - KPI4 special case: 100 - avg(children).

import { FISCAL_MONTH_TO_CAL } from "./fiscal-year";

export interface IndBasic {
  id: string;
  code: string;
  parent_id: string | null;
  level: string;
  is_leaf: boolean;
  is_active: boolean;
  frequency: string | null;
}

export interface MeasBasic {
  indicator_id: string;
  period_month: number | null;
  calculated_value: number | null;
}

// leafId -> Map<calMonth, value>
export type MonthMap = Map<number, number>;

/** Build leaf monthly value maps, with yearly carry-forward. */
export function buildLeafMonthly(
  inds: IndBasic[],
  meas: MeasBasic[],
): Map<string, MonthMap> {
  const byInd = new Map<string, IndBasic>(inds.map((i) => [i.id, i]));
  const out = new Map<string, MonthMap>();
  for (const m of meas) {
    if (m.period_month == null || m.calculated_value == null) continue;
    if (!out.has(m.indicator_id)) out.set(m.indicator_id, new Map());
    out.get(m.indicator_id)!.set(m.period_month, Number(m.calculated_value));
  }
  // Note: no yearly carry-forward — a yearly measurement represents the value
  // at the month it was entered only. Parents aggregate month-by-month, so
  // missing months bubble up as null instead of being filled by a stale value.
  return out;
}


/** Recursively resolve a value at a given fiscal month for any indicator. */
export function computeAtMonth(
  ind: IndBasic,
  cal: number,
  ctx: {
    indsByParent: Map<string | null, IndBasic[]>;
    leafMonthly: Map<string, MonthMap>;
    memo: Map<string, number | null>;
  },
): number | null {
  const key = `${ind.id}@${cal}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key)!;
  let val: number | null;
  if (ind.is_leaf) {
    val = ctx.leafMonthly.get(ind.id)?.get(cal) ?? null;
  } else {
    const children = (ctx.indsByParent.get(ind.id) ?? []).filter((c) => c.is_active);
    const vals: number[] = [];
    for (const c of children) {
      const v = computeAtMonth(c, cal, ctx);
      if (v != null) vals.push(v);
    }
    if (vals.length === 0) {
      val = null;
    } else {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      val = ind.code === "KPI4" ? 100 - avg : avg;
    }
  }
  ctx.memo.set(key, val);
  return val;
}

/** 12 fiscal months of values for an indicator. */
export function computeMonthly(
  ind: IndBasic,
  ctx: Parameters<typeof computeAtMonth>[2],
): (number | null)[] {
  return FISCAL_MONTH_TO_CAL.map((cm) => computeAtMonth(ind, cm, ctx));
}

export function makeCalcContext(inds: IndBasic[], meas: MeasBasic[]) {
  const indsByParent = new Map<string | null, IndBasic[]>();
  for (const i of inds) {
    const k = i.parent_id;
    if (!indsByParent.has(k)) indsByParent.set(k, []);
    indsByParent.get(k)!.push(i);
  }
  return {
    indsByParent,
    leafMonthly: buildLeafMonthly(inds, meas),
    memo: new Map<string, number | null>(),
  };
}

/** Average of a period (months = list of calendar months to include). */
export function avgOverMonths(values: (number | null)[], months: number[]): number | null {
  const vals: number[] = [];
  for (let i = 0; i < FISCAL_MONTH_TO_CAL.length; i++) {
    if (!months.includes(FISCAL_MONTH_TO_CAL[i])) continue;
    const v = values[i];
    if (v != null) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
