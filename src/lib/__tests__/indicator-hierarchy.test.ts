import { describe, expect, it } from "vitest";
import { analysisScopes, indicatorBranch } from "../indicator-hierarchy";

const indicators = [
  { id: "sub", parent_id: "qi", code: "SUB2.1.1", level: "subqi" },
  { id: "other-kpi", parent_id: "other", code: "KPI1", level: "kpi" },
  { id: "qi", parent_id: "kpi", code: "QI2.1", level: "qi" },
  { id: "obj", parent_id: null, code: "OBJ2", level: "object" },
  { id: "kpi", parent_id: "obj", code: "KPI2", level: "kpi" },
  { id: "other", parent_id: null, code: "OBJ1", level: "object" },
];

describe("analysis hierarchy filters", () => {
  it("limits an Objective to its KPI, QI and Sub-QI in parent-first order", () => {
    expect(indicatorBranch(indicators, "obj").map(({ indicator, depth }) => [indicator.id, depth]))
      .toEqual([["obj", 0], ["kpi", 1], ["qi", 2], ["sub", 3]]);
  });
  it("limits a KPI to its related QI and Sub-QI", () => {
    expect(indicatorBranch(indicators, "kpi").map(({ indicator }) => indicator.id))
      .toEqual(["kpi", "qi", "sub"]);
  });
  it("offers only Objectives and KPIs in the first filter", () => {
    expect(analysisScopes(indicators).map(({ indicator }) => indicator.id))
      .toEqual(["other", "other-kpi", "obj", "kpi"]);
  });
  it("uses parent links even when code numbering differs", () => {
    const changed = indicators.map(indicator => indicator.id === "kpi" ? { ...indicator, code: "KPI10" } : indicator);
    expect(indicatorBranch(changed, "obj").map(({ indicator }) => indicator.id)).toEqual(["obj", "kpi", "qi", "sub"]);
  });
  it("returns no stale choices when the selected root is removed", () => {
    expect(indicatorBranch(indicators, "removed")).toEqual([]);
  });
});