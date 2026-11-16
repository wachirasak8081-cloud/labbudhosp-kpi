import { mean, median } from "simple-statistics";
import { toneFor } from "./indicator-status";

export function controlStats(values: (number | null)[]) {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  const center = mean(valid);
  const ranges = values.slice(1).flatMap((v, i) => v != null && values[i] != null ? [Math.abs(v - Number(values[i]))] : []);
  const sigma = ranges.length ? mean(ranges) / 1.128 : null;
  return { center, median: median(valid), sigma, ucl: sigma == null ? null : center + 3 * sigma, lcl: sigma == null ? null : center - 3 * sigma, provisional: valid.length < 20 };
}
export function failingStreak(values: (number | null)[], target: number | null, condition: string | null, inverted: boolean) {
  const ends: number[] = [];
  let streak = 0;
  values.forEach((v, index) => {
    streak = v != null && target != null && toneFor(v, target, condition, inverted) !== "green" ? streak + 1 : 0;
    if (streak >= 3) ends.push(index);
  });
  return ends;
}
export function paretoCounts(causes: (string | null)[]) {
  const counts = new Map<string, number>();
  causes.forEach((c) => { const key = c?.trim() || "ยังไม่ระบุสาเหตุ"; counts.set(key, (counts.get(key) ?? 0) + 1); });
  let cumulative = 0;
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, cumulative: (cumulative += count) / causes.length * 100 }));
}
export function submissionDeadline(year: number, calendarMonth: number) {
  return new Date(Date.UTC(year - 543 - (calendarMonth >= 10 ? 1 : 0), calendarMonth, 15));
}
export const EVIDENCE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export function validateEvidence(type: string, size: number) {
  if (!EVIDENCE_TYPES.includes(type)) return "รองรับ PDF, Word, Excel, PNG, JPG และ WebP เท่านั้น";
  return size > 10 * 1024 * 1024 ? "ขนาดไฟล์ต้องไม่เกิน 10 MB" : null;
}