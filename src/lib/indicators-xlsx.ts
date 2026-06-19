import * as XLSX from "xlsx";

export const TEMPLATE_HEADERS = [
  "level", "parent_code", "code", "name_th",
  "formula_description", "formula_link",
  "numerator_description", "denominator_description",
  "target_value", "target_condition", "unit", "frequency",
  "is_leaf", "is_inverted", "department_code", "sort_order",
] as const;

export type ImportRow = {
  level: "object" | "kpi" | "qi" | "subqi";
  parent_code: string | null;
  code: string;
  name_th: string;
  formula_description: string | null;
  formula_link: string | null;
  numerator_description: string | null;
  denominator_description: string | null;
  target_value: number | null;
  target_condition: "gte" | "lte" | "eq" | null;
  unit: string | null;
  frequency: "monthly" | "yearly" | null;
  is_leaf: boolean;
  is_inverted: boolean;
  department_code: string | null;
  sort_order: number;
};

export function downloadTemplate() {
  const example = [{
    level: "object", parent_code: "", code: "OBJ_NEW", name_th: "ชื่อวัตถุประสงค์",
    formula_description: "", formula_link: "", numerator_description: "", denominator_description: "",
    target_value: 100, target_condition: "gte", unit: "%", frequency: "monthly",
    is_leaf: false, is_inverted: false, department_code: "", sort_order: 1,
  }];
  const ws = XLSX.utils.json_to_sheet(example, { header: TEMPLATE_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "indicators");
  XLSX.writeFile(wb, "indicators-template.xlsx");
}

export function exportIndicators(items: {
  level: string; parent_code: string | null; code: string; name_th: string;
  formula_description: string | null; formula_link: string | null;
  numerator_description: string | null; denominator_description: string | null;
  target_value: number | null; target_condition: string | null;
  unit: string | null; frequency: string | null;
  is_leaf: boolean; is_inverted: boolean;
  department_code: string | null; sort_order: number;
}[]) {
  const ws = XLSX.utils.json_to_sheet(items, { header: TEMPLATE_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "indicators");
  XLSX.writeFile(wb, `indicators-export-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y" || s === "t";
}
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}

export async function parseExcel(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return json.map((r) => ({
    level: (toStr(r.level) ?? "object") as ImportRow["level"],
    parent_code: toStr(r.parent_code),
    code: toStr(r.code) ?? "",
    name_th: toStr(r.name_th) ?? "",
    formula_description: toStr(r.formula_description),
    formula_link: toStr(r.formula_link),
    numerator_description: toStr(r.numerator_description),
    denominator_description: toStr(r.denominator_description),
    target_value: toNum(r.target_value),
    target_condition: (toStr(r.target_condition) as ImportRow["target_condition"]) ?? "gte",
    unit: toStr(r.unit) ?? "%",
    frequency: (toStr(r.frequency) as ImportRow["frequency"]) ?? "monthly",
    is_leaf: toBool(r.is_leaf),
    is_inverted: toBool(r.is_inverted),
    department_code: toStr(r.department_code),
    sort_order: Math.trunc(toNum(r.sort_order) ?? 0),
  }));
}

export type RowError = { row: number; field: string; message: string };

export function validateRows(
  rows: ImportRow[],
  existingCodes: Set<string>,
  deptCodes: Set<string>,
): RowError[] {
  const errors: RowError[] = [];
  const inFile = new Set<string>(rows.map((r) => r.code));
  rows.forEach((r, i) => {
    const n = i + 2; // header row
    if (!r.code) errors.push({ row: n, field: "code", message: "ต้องระบุรหัส" });
    if (!r.name_th) errors.push({ row: n, field: "name_th", message: "ต้องระบุชื่อ" });
    if (!["object", "kpi", "qi", "subqi"].includes(r.level))
      errors.push({ row: n, field: "level", message: "ระดับไม่ถูกต้อง" });
    if (r.target_condition && !["gte", "lte", "eq"].includes(r.target_condition))
      errors.push({ row: n, field: "target_condition", message: "เงื่อนไขเป้าหมายไม่ถูกต้อง" });
    if (r.frequency && !["monthly", "yearly"].includes(r.frequency))
      errors.push({ row: n, field: "frequency", message: "ความถี่ไม่ถูกต้อง" });
    if (r.level !== "object" && !r.parent_code)
      errors.push({ row: n, field: "parent_code", message: "ต้องระบุรหัสแม่" });
    if (r.parent_code && !inFile.has(r.parent_code) && !existingCodes.has(r.parent_code))
      errors.push({ row: n, field: "parent_code", message: `ไม่พบรหัสแม่ "${r.parent_code}"` });
    if (r.department_code && !deptCodes.has(r.department_code))
      errors.push({ row: n, field: "department_code", message: `ไม่พบสาขา "${r.department_code}"` });
  });
  return errors;
}
