import { describe, it, expect } from "vitest";
import { parseMonth, validateMeasurementRows, type MeasurementImportRow } from "../measurements-xlsx";

const row = (o: Partial<MeasurementImportRow>): MeasurementImportRow => ({
  code: "QI1.1", month: 10, numerator: 1, denominator: 2, note: null, ...o,
});

describe("measurements-xlsx", () => {
  it("parses calendar numbers and Thai month names", () => {
    expect(parseMonth(10)).toBe(10);
    expect(parseMonth("1")).toBe(1);
    expect(parseMonth("ต.ค.")).toBe(10);
    expect(parseMonth("ตค")).toBe(10);
    expect(parseMonth("ก.ย.")).toBe(9);
    expect(parseMonth("13")).toBeNull();
    expect(parseMonth("")).toBeNull();
  });

  const leaf = new Set(["QI1.1", "QI1.2"]);

  it("accepts valid rows", () => {
    expect(validateMeasurementRows([row({}), row({ code: "QI1.2", month: 11 })], leaf, null)).toEqual([]);
  });

  it("rejects unknown codes, bad months and duplicates", () => {
    const errs = validateMeasurementRows(
      [row({ code: "XX9" }), row({ month: null }), row({}), row({})],
      leaf, null,
    );
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("code");
    expect(fields).toContain("month");
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });

  it("blocks codes outside the user's allowed branches", () => {
    const errs = validateMeasurementRows([row({ code: "QI1.2" })], leaf, new Set(["QI1.1"]));
    expect(errs[0].field).toBe("code");
  });
});
