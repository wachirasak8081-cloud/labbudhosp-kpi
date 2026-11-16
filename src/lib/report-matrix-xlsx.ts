import * as XLSX from "xlsx";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "./fiscal-year";
import { decimalsFor } from "./indicator-format";
import { statusLabel, targetSymbol, type Tone } from "./indicator-status";

export type MatrixExportRow = {
  ind: {
    id: string; code: string; name_th: string; level: string; parent_id: string | null;
    target_value: number | null; target_condition: string | null; unit: string | null;
    formula_description?: string | null; numerator_description?: string | null;
    denominator_description?: string | null; formula_link?: string | null;
  };
  monthCells: { value: number | null; numerator: number | null; denominator: number | null }[];
  avg: number | null;
  tone: Tone;
};

const levels: Record<string, string> = {
  objective: "Objective", object: "Objective", kpi: "KPI", qi: "QI", subqi: "Sub-QI", sub_qi: "Sub-QI",
};

export function buildMatrixWorkbook(rows: MatrixExportRow[], fiscalYear: number, department: string) {
  const workbook = XLSX.utils.book_new();
  const summary: unknown[][] = [
    ["รายงานสรุปผลตัวชี้วัด", "ปีงบประมาณ", fiscalYear, "สาขางาน", department],
    ["ระดับ", "รหัส", "ตัวชี้วัด", "หน่วย", ...THAI_MONTHS.flatMap(m => [`${m} ตัวตั้ง`, `${m} ตัวหาร`, `${m} ผล`]), "ตัวตั้งรวม", "ตัวหารรวม", "เฉลี่ยผล", "เป้าหมาย", "สถานะ"],
    ...rows.map(({ ind, monthCells, avg, tone }) => [
      levels[ind.level] ?? ind.level, ind.code, ind.name_th, ind.unit,
      ...monthCells.flatMap(c => [c.numerator, c.denominator, c.value]),
      null, null, avg, ind.target_value == null ? null : `${targetSymbol(ind.target_condition)}${ind.target_value}`, statusLabel(tone),
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(summary);
  rows.forEach(({ ind }, i) => {
    const r = i + 2;
    const excelRow = r + 1;
    const resultCols = THAI_MONTHS.map((_, m) => XLSX.utils.encode_col(6 + m * 3));
    const sum = (offset: number) => {
      const refs = THAI_MONTHS.map((_, m) => `${XLSX.utils.encode_col(4 + m * 3 + offset)}${excelRow}`).join(",");
      return `IF(COUNT(${refs})=0,"",SUM(${refs}))`;
    };
    sheet[XLSX.utils.encode_cell({ r, c: 40 })] = { t: "n", f: sum(0) };
    sheet[XLSX.utils.encode_cell({ r, c: 41 })] = { t: "n", f: sum(1) };
    const refs = resultCols.map(c => `${c}${excelRow}`).join(",");
    sheet[XLSX.utils.encode_cell({ r, c: 42 })] = { t: "n", f: `IF(COUNT(${refs})=0,"",AVERAGE(${refs}))` };
    for (const c of [...THAI_MONTHS.map((_, m) => 6 + m * 3), 42]) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = `0.${"0".repeat(decimalsFor(ind.code))}`;
    }
  });
  sheet["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 65 }, { wch: 12 }, ...Array.from({ length: 41 }, () => ({ wch: 18 }))];
  sheet["!autofilter"] = { ref: `A2:AS${rows.length + 2}` };
  XLSX.utils.book_append_sheet(workbook, sheet, "สรุปรายเดือน");

  const details: unknown[][] = [["ปีงบประมาณ", "ระดับ", "รหัส", "ตัวชี้วัด", "เดือน", "ตัวตั้ง", "ตัวหาร", "ผล", "หน่วย"]];
  rows.forEach(({ ind, monthCells }) => monthCells.forEach((c, m) => {
    details.push([fiscalYear, levels[ind.level] ?? ind.level, ind.code, ind.name_th, THAI_MONTHS[m], c.numerator, c.denominator, c.value, ind.unit]);
  }));
  const detailSheet = XLSX.utils.aoa_to_sheet(details);
  rows.forEach(({ ind }, i) => FISCAL_MONTH_TO_CAL.forEach((_, m) => {
    const cell = detailSheet[XLSX.utils.encode_cell({ r: 1 + i * 12 + m, c: 7 })];
    if (cell) cell.z = `0.${"0".repeat(decimalsFor(ind.code))}`;
  }));
  detailSheet["!cols"] = [12, 12, 16, 65, 12, 18, 18, 18, 12].map(wch => ({ wch }));
  detailSheet["!autofilter"] = { ref: `A1:I${details.length}` };
  XLSX.utils.book_append_sheet(workbook, detailSheet, "ตัวตั้ง ตัวหาร ผล");

  const names = new Map(rows.map(r => [r.ind.id, r.ind.code]));
  const definitions = XLSX.utils.aoa_to_sheet([
    ["ระดับ", "รหัส", "ตัวชี้วัด", "รหัสระดับแม่", "สูตรคำนวณ", "คำอธิบายตัวตั้ง", "คำอธิบายตัวหาร", "ลิงก์สูตร", "หน่วย"],
    ...rows.map(({ ind }) => [levels[ind.level] ?? ind.level, ind.code, ind.name_th, ind.parent_id ? names.get(ind.parent_id) ?? null : null, ind.formula_description, ind.numerator_description, ind.denominator_description, ind.formula_link, ind.unit]),
    [],
    ["หมายเหตุ", "ผลระดับแม่ใช้สูตรเดียวกับหน้ารายงาน ไม่รวมตัวตั้ง/ตัวหารจากลูกแทนสูตรค่าเฉลี่ย ช่องว่างหมายถึงไม่มีข้อมูลตัวตั้ง/ตัวหารที่บันทึกไว้"],
  ]);
  definitions["!cols"] = [12, 16, 65, 18, 65, 55, 55, 55, 12].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, definitions, "รายละเอียดตัวชี้วัด");
  return workbook;
}

export function downloadMatrixWorkbook(workbook: XLSX.WorkBook, fiscalYear: number) {
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const file = new File([bytes], `KPI-QI-${fiscalYear}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], title: file.name }).catch(e => {
      if ((e as DOMException).name !== "AbortError") throw e;
    });
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}