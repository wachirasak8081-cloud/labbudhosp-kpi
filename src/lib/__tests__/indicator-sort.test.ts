import { describe, it, expect } from "vitest";
import { sortIndicators } from "../indicator-sort";

describe("indicator-sort", () => {
  it("orders objective → kpi → qi → sub-qi hierarchically", () => {
    const list = [
      { code: "SUB2.1.1", level: "subqi" },
      { code: "QI1.2", level: "qi" },
      { code: "KPI2", level: "kpi" },
      { code: "OBJ1", level: "object" },
      { code: "QI2.1", level: "qi" },
      { code: "KPI1", level: "kpi" },
      { code: "QI1.1", level: "qi" },
    ];
    expect(sortIndicators(list).map((i) => i.code)).toEqual([
      "OBJ1", "KPI1", "QI1.1", "QI1.2", "KPI2", "QI2.1", "SUB2.1.1",
    ]);
  });

  it("sorts numerically, not as text (10 after 9)", () => {
    const list = [{ code: "KPI10", level: "kpi" }, { code: "KPI9", level: "kpi" }];
    expect(sortIndicators(list).map((i) => i.code)).toEqual(["KPI9", "KPI10"]);
  });

  it("does not mutate the input array", () => {
    const list = [{ code: "KPI2", level: "kpi" }, { code: "KPI1", level: "kpi" }];
    sortIndicators(list);
    expect(list[0].code).toBe("KPI2");
  });
});
