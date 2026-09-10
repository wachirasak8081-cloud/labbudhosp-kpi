import { describe, it, expect } from "vitest";
import { makeCalcContext, computeAtMonth, computeMonthly, avgOverMonths, type IndBasic } from "../indicator-calc";
import { FISCAL_MONTH_TO_CAL } from "../fiscal-year";

const ind = (o: Partial<IndBasic> & { id: string; code: string }): IndBasic => ({
  parent_id: null, level: "qi", is_leaf: true, is_active: true, frequency: "monthly", ...o,
});

describe("indicator-calc", () => {
  const inds: IndBasic[] = [
    ind({ id: "obj", code: "OBJ1", level: "object", is_leaf: false }),
    ind({ id: "kpi1", code: "KPI1", level: "kpi", is_leaf: false, parent_id: "obj" }),
    ind({ id: "qi1", code: "QI1.1", parent_id: "kpi1" }),
    ind({ id: "qi2", code: "QI1.2", parent_id: "kpi1" }),
  ];

  it("leaf uses the value of the month it was entered (no carry-forward)", () => {
    const ctx = makeCalcContext(inds, [{ indicator_id: "qi1", period_month: 10, calculated_value: 80 }]);
    expect(computeAtMonth(inds[2], 10, ctx)).toBe(80);
    expect(computeAtMonth(inds[2], 11, ctx)).toBeNull();
  });

  it("parent averages its active children", () => {
    const ctx = makeCalcContext(inds, [
      { indicator_id: "qi1", period_month: 10, calculated_value: 80 },
      { indicator_id: "qi2", period_month: 10, calculated_value: 60 },
    ]);
    expect(computeAtMonth(inds[1], 10, ctx)).toBe(70);
    expect(computeAtMonth(inds[0], 10, ctx)).toBe(70);
  });

  it("ignores inactive children", () => {
    const list = inds.map((i) => (i.id === "qi2" ? { ...i, is_active: false } : i));
    const ctx = makeCalcContext(list, [
      { indicator_id: "qi1", period_month: 10, calculated_value: 80 },
      { indicator_id: "qi2", period_month: 10, calculated_value: 60 },
    ]);
    expect(computeAtMonth(list[1], 10, ctx)).toBe(80);
  });

  it("returns null when no child has data", () => {
    const ctx = makeCalcContext(inds, []);
    expect(computeAtMonth(inds[1], 10, ctx)).toBeNull();
  });

  it("KPI4 uses 100 - average of children", () => {
    const k4: IndBasic[] = [
      ind({ id: "k4", code: "KPI4", level: "kpi", is_leaf: false }),
      ind({ id: "a", code: "QI4.1", parent_id: "k4" }),
      ind({ id: "b", code: "QI4.2", parent_id: "k4" }),
    ];
    const ctx = makeCalcContext(k4, [
      { indicator_id: "a", period_month: 10, calculated_value: 1.5 },
      { indicator_id: "b", period_month: 10, calculated_value: 0.5 },
    ]);
    expect(computeAtMonth(k4[0], 10, ctx)).toBeCloseTo(99, 10);
  });

  it("computeMonthly returns 12 fiscal months in order", () => {
    const ctx = makeCalcContext(inds, [{ indicator_id: "qi1", period_month: 1, calculated_value: 50 }]);
    const m = computeMonthly(inds[2], ctx);
    expect(m).toHaveLength(12);
    expect(m[FISCAL_MONTH_TO_CAL.indexOf(1)]).toBe(50);
  });

  it("avgOverMonths averages only the requested months and skips nulls", () => {
    const vals = FISCAL_MONTH_TO_CAL.map((cm) => (cm === 10 ? 90 : cm === 11 ? 70 : null));
    expect(avgOverMonths(vals, [10, 11])).toBe(80);
    expect(avgOverMonths(vals, [10, 11, 12])).toBe(80);
    expect(avgOverMonths(vals, [12])).toBeNull();
  });
});
