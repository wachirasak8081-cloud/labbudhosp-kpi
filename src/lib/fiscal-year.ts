// Thai fiscal year helpers. Thai fiscal year (ปีงบประมาณ) starts Oct 1.
// FY 2569 = Oct 1, 2025 — Sep 30, 2026.

export function currentFiscalYear(date = new Date()): number {
  const month = date.getMonth() + 1; // 1-12
  const yearCE = date.getFullYear();
  const fyCE = month >= 10 ? yearCE + 1 : yearCE;
  return fyCE + 543; // Buddhist Era
}

export const DEFAULT_FISCAL_YEAR = 2569;

export function fiscalYearOptions(extra: number[] = []): number[] {
  const cur = currentFiscalYear();
  const base = new Set<number>([2567, 2568, 2569, 2570, cur, cur + 1, ...extra]);
  return Array.from(base).sort((a, b) => a - b);
}

export const THAI_MONTHS = [
  "ตุลาคม", "พฤศจิกายน", "ธันวาคม", "มกราคม", "กุมภาพันธ์", "มีนาคม",
  "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน",
];

// Fiscal month index (1=ต.ค. ... 12=ก.ย.) to calendar month (1-12)
export const FISCAL_MONTH_TO_CAL = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
