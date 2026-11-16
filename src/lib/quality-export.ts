import { formatIndicatorValue } from "./indicator-format";
import { toneFor, statusLabel } from "./indicator-status";
import { paretoCounts } from "./quality-analysis";
export async function exportReview(data: {rows:{ind:{code:string;name_th:string;target_value:number|null;target_condition:string|null;is_inverted:boolean;level:string};average:number|null;monthly:(number|null)[]}[];capa:{problem_description:string;root_cause:string|null;action_plan:string;status:string;responsible_person:string|null;effectiveness:string|null}[]},year:number,issues:unknown[][],recommendations:string[]) {
 const XLSX=await import("xlsx"); const workbook=XLSX.utils.book_new();
 const append=(name:string,rows:unknown[][])=>XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);
 append("สรุปทบทวน",[["Management Review ISO 15189 Clause 8.9",year],["ข้อมูลตามสิทธิ์บัญชี / รวมร่างและรออนุมัติ"],["วันที่จัดทำ",new Date().toLocaleDateString("th-TH")],["ข้อเสนอเพื่อพิจารณา"],...recommendations.map(r=>[r]),["มติที่ประชุม",""],["ผู้รับผิดชอบ",""],["กำหนดดำเนินการ",""],["ประสิทธิผลระบบ / ทรัพยากร / ความเสี่ยง","รอทบทวนโดยที่ประชุม"]]);
 append("ผลตัวชี้วัด",[["รหัส","ชื่อตัวชี้วัด","ค่าเฉลี่ย","เป้า","สถานะ","ต.ค.","พ.ย.","ธ.ค.","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย."],...data.rows.map(r=>[r.ind.code,r.ind.name_th,formatIndicatorValue(r.ind.code,r.average),formatIndicatorValue(r.ind.code,r.ind.target_value),statusLabel(toneFor(r.average,r.ind.target_value,r.ind.target_condition,r.ind.is_inverted)),...r.monthly.map(v=>formatIndicatorValue(r.ind.code,v))])]);
 append("NC-CAPA",[["ปัญหา","สาเหตุ","แผนแก้ไข","ผู้รับผิดชอบ","สถานะ","ประสิทธิผล"],...data.capa.map(c=>[c.problem_description,c.root_cause,c.action_plan,c.responsible_person,c.status,c.effectiveness])]);
 append("ปัญหาบันทึกผล",[["รหัส","ตัวชี้วัด","เดือน","ปัญหา"],...issues]);
 append("Pareto สาเหตุ",[["สาเหตุ","จำนวน","ร้อยละสะสม"],...paretoCounts(data.capa.map(c=>c.root_cause)).map(p=>[p.name,p.count,p.cumulative])]);
 XLSX.writeFile(workbook,`Management-Review-${year}.xlsx`);
}