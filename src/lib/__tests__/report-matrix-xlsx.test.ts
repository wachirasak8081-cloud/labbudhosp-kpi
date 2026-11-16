import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildMatrixWorkbook, type MatrixExportRow } from "../report-matrix-xlsx";

const rows: MatrixExportRow[] = ["objective", "kpi", "qi", "sub_qi"].map((level, i) => ({
  ind: { id: String(i), code: i === 1 ? "KPI4" : `CODE${i}`, name_th: `ตัวชี้วัด ${i}`, level, parent_id: i ? String(i - 1) : null, target_value: 90, target_condition: "gte", unit: "%", formula_description: "สูตร", numerator_description: "จำนวนผ่าน", denominator_description: "จำนวนทั้งหมด" },
  monthCells: Array.from({ length: 12 }, (_, m) => ({ value: m === 0 ? 99.1234 : null, numerator: i === 3 && m === 0 ? 0 : null, denominator: i === 3 && m === 0 ? 100 : null })),
  avg: 99.1234, tone: "green",
}));

describe("monthly matrix workbook", () => {
  it("exports all four levels, recorded numerator/denominator including zero, and actual results", () => {
    const wb = buildMatrixWorkbook(rows, 2569, "ทุกสาขา");
    const detail = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["ตัวตั้ง ตัวหาร ผล"], { header: 1, defval: null });
    expect(detail).toHaveLength(49);
    expect([detail[1][1], detail[13][1], detail[25][1], detail[37][1]]).toEqual(["Objective", "KPI", "QI", "Sub-QI"]);
    expect(detail[37].slice(4, 8)).toEqual(["ต.ค.", 0, 100, 99.1234]);
    expect(detail[1].slice(5, 8)).toEqual([null, null, 99.1234]);
    expect(wb.Sheets["สรุปรายเดือน"].G4.z).toBe("0.0000");
  });
  it("includes formula definitions and monthly-average formulas rather than ratios of totals", () => {
    const wb = buildMatrixWorkbook(rows, 2569, "ทุกสาขา");
    expect(wb.Sheets["รายละเอียดตัวชี้วัด"].E5.v).toBe("สูตร");
    expect(wb.Sheets["รายละเอียดตัวชี้วัด"].F5.v).toBe("จำนวนผ่าน");
    expect(wb.Sheets["รายละเอียดตัวชี้วัด"].G5.v).toBe("จำนวนทั้งหมด");
    expect(wb.Sheets["สรุปรายเดือน"].AQ3.f).toBe('IF(COUNT(G3,J3,M3,P3,S3,V3,Y3,AB3,AE3,AH3,AK3,AN3)=0,"",AVERAGE(G3,J3,M3,P3,S3,V3,Y3,AB3,AE3,AH3,AK3,AN3))');
  });
});