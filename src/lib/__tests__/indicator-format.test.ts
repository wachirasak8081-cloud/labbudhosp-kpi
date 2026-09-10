import { describe, it, expect } from "vitest";
import {
  decimalsOfValue, decimalsFor, registerIndicatorDecimals,
  formatIndicatorValue, formatTargetValue, formatDiff,
} from "../indicator-format";

describe("indicator-format", () => {
  it("clamps detected decimals to 2..4", () => {
    expect(decimalsOfValue(90)).toBe(2);
    expect(decimalsOfValue(0.001)).toBe(3);
    expect(decimalsOfValue(0.00001)).toBe(4);
    expect(decimalsOfValue(null)).toBe(2);
  });

  it("uses 4 decimals for the KPI4 family", () => {
    expect(decimalsFor("KPI4")).toBe(4);
    expect(decimalsFor("QI4.1")).toBe(4);
    expect(decimalsFor("KPI1")).toBe(2);
  });

  it("registers decimals from the indicator target value", () => {
    registerIndicatorDecimals([{ code: "QI7.3", target_value: 0.001 }]);
    expect(decimalsFor("QI7.3")).toBe(3);
  });

  it("formats values, targets and diffs", () => {
    expect(formatIndicatorValue("KPI1", 95.456)).toBe("95.46");
    expect(formatIndicatorValue("KPI4", 99.12345)).toBe("99.1235");
    expect(formatIndicatorValue("KPI1", null)).toBe("—");
    expect(formatTargetValue("KPI1", 90)).toBe("90.00");
    expect(formatTargetValue("KPI1", null, "-")).toBe("-");
    expect(formatDiff("KPI1", 1.5)).toBe("+1.50");
    expect(formatDiff("KPI1", -1.5)).toBe("-1.50");
  });
});
