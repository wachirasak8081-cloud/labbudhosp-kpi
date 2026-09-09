import * as XLSX from "xlsx";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";

export const MEASUREMENT_HEADERS = ["code", "month", "numerator", "denominator", "note"] as const;

export type MeasurementImportRow = {
  code: string;
  month: number | null; // calendar month 1-12
  numerator: number | null;
  denominator: number | null;
  note: string | null;
};

export type MeasurementRowError = { row: number; field: string; message: string };

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Accepts 1-12 (calendar), or a Thai month abbreviation like "ต.ค."
export function parseMonth(v: unknown): number | null {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.trunc(n);
  const idx = THAI_MONTHS.findIndex((m) => m === s || m.replace(/\./g, "") === s.replace(/\./g, ""));
  if (idx >= 0) return FISCAL_MONTH_TO_CAL[idx];
  return null;
}

export function downloadMeasurementTemplate(sampleCodes: string[] = []) {
  const codes = sampleCodes.length ? sampleCodes.slice(0, 5) : ["QI1.1"];
  const rows = codes.map((code) => ({
    code, month: 10, numerator: 0, denominator: 0, note: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: MEASUREMENT_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "measurements");
  XLSX.writeFile(wb, "measurements-template.xlsx");
}

export async function parseMeasurementExcel(file: File): Promise<MeasurementImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return json
    .map((r) => ({
      code: toStr(r.code) ?? "",
      month: parseMonth(r.month),
      numerator: toNum(r.numerator),
      denominator: toNum(r.denominator),
      note: toStr(r.note),
    }))
    .filter((r) => r.code !== "" || r.month !== null);
}

export function validateMeasurementRows(
  rows: MeasurementImportRow[],
  leafCodes: Set<string>,
  allowedCodes: Set<string> | null, // null = ทุกสาขา
): MeasurementRowError[] {
  const errors: MeasurementRowError[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const n = i + 2;
    if (!r.code) errors.push({ row: n, field: "code", message: "ต้องระบุรหัสตัวชี้วัด" });
    else if (!leafCodes.has(r.code))
      errors.push({ row: n, field: "code", message: `ไม่พบรหัส "${r.code}" หรือไม่ใช่ตัวชี้วัดระดับล่างสุด` });
    else if (allowedCodes && !allowedCodes.has(r.code))
      errors.push({ row: n, field: "code", message: `ไม่มีสิทธิ์บันทึกตัวชี้วัด "${r.code}"` });

    if (r.month == null) errors.push({ row: n, field: "month", message: "เดือนไม่ถูกต้อง (1-12 หรือชื่อเดือนไทย)" });
    if (r.numerator == null && r.denominator == null)
      errors.push({ row: n, field: "numerator", message: "ต้องระบุตัวตั้งหรือตัวหารอย่างน้อยหนึ่งค่า" });
    if (r.denominator != null && r.denominator === 0)
      errors.push({ row: n, field: "denominator", message: "ตัวหารต้องไม่เท่ากับ 0" });

    if (r.code && r.month != null) {
      const key = `${r.code}|${r.month}`;
      if (seen.has(key)) errors.push({ row: n, field: "code", message: "ซ้ำกับแถวก่อนหน้า (รหัส+เดือนเดียวกัน)" });
      seen.add(key);
    }
  });
  return errors;
}
