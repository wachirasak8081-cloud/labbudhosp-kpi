// CAPA / PDCA helpers and shared types

export type Severity = "low" | "medium" | "high" | "critical";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type NcSource = "kpi_below_target" | "iqa" | "eqa" | "complaint" | "audit" | "incident" | "manual";
export type RcaMethod = "5why" | "fishbone" | "pareto" | "other";
export type PdcaPhase = "plan" | "do" | "check" | "act";
export type ApprovalStatus = "draft" | "pending_manager" | "approved" | "rejected";
export type Effectiveness = "effective" | "partial" | "ineffective";

export type FishboneCategory = "man" | "machine" | "method" | "material" | "measurement" | "environment";

export interface FiveWhyStep { why: string; because: string }
export interface FishboneData { causes: Record<FishboneCategory, string[]> }
export interface RcaData {
  fiveWhy?: FiveWhyStep[];
  fishbone?: FishboneData;
  rootCauseSummary?: string;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "ต่ำ", medium: "ปานกลาง", high: "สูง", critical: "วิกฤต",
};
export const SEVERITY_TONE: Record<Severity, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-amber-200 text-amber-800",
  high: "bg-orange-500 text-white",
  critical: "bg-rose-600 text-white",
};

export const NC_SOURCE_LABEL: Record<NcSource, string> = {
  kpi_below_target: "KPI ต่ำกว่าเป้า", iqa: "IQA", eqa: "EQA",
  complaint: "ข้อร้องเรียน", audit: "ตรวจสอบภายใน", incident: "อุบัติการณ์", manual: "บันทึกด้วยตนเอง",
};

export const PDCA_LABEL: Record<PdcaPhase, string> = {
  plan: "Plan — วางแผน", do: "Do — ดำเนินการ", check: "Check — ตรวจสอบผล", act: "Act — ปรับปรุง/ปิด",
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  draft: "ร่าง", pending_manager: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ",
};

export const EFFECTIVENESS_LABEL: Record<Effectiveness, string> = {
  effective: "ได้ผลดี", partial: "ได้ผลบางส่วน", ineffective: "ไม่ได้ผล",
};

export const FISHBONE_LABEL: Record<FishboneCategory, string> = {
  man: "คน (Man)", machine: "เครื่องมือ (Machine)", method: "วิธีการ (Method)",
  material: "วัสดุ (Material)", measurement: "การวัด (Measurement)", environment: "สิ่งแวดล้อม (Environment)",
};

export function calcSeverity(gap: number): Severity {
  const g = Math.abs(gap);
  if (g > 10) return "critical";
  if (g > 5) return "high";
  if (g > 2) return "medium";
  return "low";
}

export function kanbanColumnOf(row: { pdca_phase?: string | null; approval_status?: string | null; status?: string }): "pending" | "in_progress" | "check" | "done" {
  if (row.status === "closed" || row.pdca_phase === "act") return "done";
  if (row.pdca_phase === "check") return "check";
  if (row.approval_status === "pending_manager" || row.approval_status === "draft") return "pending";
  return "in_progress";
}

export const KANBAN_COLUMNS: { id: "pending" | "in_progress" | "check" | "done"; title: string; tone: string }[] = [
  { id: "pending", title: "รออนุมัติ / ร่าง", tone: "bg-slate-100 border-slate-300" },
  { id: "in_progress", title: "กำลังดำเนินการ", tone: "bg-blue-50 border-blue-300" },
  { id: "check", title: "รอตรวจสอบผล", tone: "bg-amber-50 border-amber-300" },
  { id: "done", title: "เสร็จสิ้น", tone: "bg-emerald-50 border-emerald-300" },
];

export function emptyFishbone(): FishboneData {
  return { causes: { man: [], machine: [], method: [], material: [], measurement: [], environment: [] } };
}
export function emptyFiveWhy(): FiveWhyStep[] {
  return Array.from({ length: 5 }, () => ({ why: "", because: "" }));
}
