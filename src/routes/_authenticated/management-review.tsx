import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { qualityHead } from "@/lib/quality-head";
import { qualityOptions } from "@/lib/quality-data";
import { exportReview } from "@/lib/quality-export";
import { submissionDeadline } from "@/lib/quality-analysis";
import { toneFor, statusLabel } from "@/lib/indicator-status";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue } from "@/lib/indicator-format";
import { ParetoChart } from "@/components/quality-charts";
export const Route=createFileRoute("/_authenticated/management-review")({head:()=>qualityHead("ชุดสรุปทบทวนระบบบริหาร","ผล KPI ประจำปี NC/CAPA ปัญหาการบันทึก และข้อเสนอสำหรับการประชุมทบทวน ISO 15189 ข้อ 8.9"),component:ManagementReview});
function ManagementReview(){
 const {fiscalYear}=useFiscalYear();const {data}=useSuspenseQuery(qualityOptions(fiscalYear));const {hasAnyRole}=useAuth();const [busy,setBusy]=useState(false);
 if(!hasAnyRole(["admin","manager"]))return <Card><CardContent className="py-10 text-center text-muted-foreground">เมนูนี้สำหรับผู้ดูแลระบบและผู้จัดการเท่านั้น</CardContent></Card>;
 const kpis=data.rows.filter(r=>r.ind.level==="kpi");const passed=kpis.filter(r=>toneFor(r.average,r.ind.target_value,r.ind.target_condition,r.ind.is_inverted)==="green").length;const open=data.capa.filter(c=>c.status!=="closed");
 const today=new Date();
 const issues=data.rows.filter(r=>r.ind.is_leaf&&r.ind.frequency==="monthly").flatMap(r=>FISCAL_MONTH_TO_CAL.flatMap((m,i)=>{
  if(submissionDeadline(fiscalYear,m)>today)return [];const meas=data.measurements.find(x=>x.indicator_id===r.ind.id&&x.period_month===m);
  if(!meas||meas.calculated_value==null)return [[r.ind.code,r.ind.name_th,THAI_MONTHS[i],"ยังไม่มีผลวัด"]];
  const problems:string[]=[];if(meas.status!=="approved")problems.push(meas.status==="submitted"?"รออนุมัติ":"ยังไม่ส่งผล");if(!data.evidence.some(e=>e.measurement_id===meas.id))problems.push("ไม่มีหลักฐานแนบ");
  return problems.map(p=>[r.ind.code,r.ind.name_th,THAI_MONTHS[i],p]);
 }));
 const recommendations=[open.length?`ติดตาม NC/CAPA ที่ยังไม่ปิด ${open.length} เรื่อง พร้อมประเมินประสิทธิผล`:"ทบทวนประสิทธิผลและการป้องกันการเกิดซ้ำของ CAPA",issues.length?`ทบทวนปัญหาการส่งผล การอนุมัติ และหลักฐาน ${issues.length} รายการ`:"ติดตามความครบถ้วนของผลวัดและหลักฐานอย่างต่อเนื่อง",...kpis.filter(r=>r.average!=null&&toneFor(r.average,r.ind.target_value,r.ind.target_condition,r.ind.is_inverted)!=="green").map(r=>`ทบทวน ${r.ind.code} ${r.ind.name_th} และกำหนดผู้รับผิดชอบ`),"พิจารณาทรัพยากร ความเสี่ยง ผลตรวจประเมิน และข้อคิดเห็นผู้ใช้บริการร่วมกับข้อมูลนี้"];
 const download=async()=>{setBusy(true);try{await exportReview(data,fiscalYear,issues,recommendations);}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 return <section className="space-y-6 review-pack"><header className="flex justify-between gap-3 flex-wrap"><div><h1 className="text-2xl font-semibold">ชุดสรุปทบทวนระบบบริหาร</h1><p className="text-muted-foreground">ปีงบประมาณ {fiscalYear} · ISO 15189 ข้อ 8.9</p><p className="text-xs text-muted-foreground">ข้อมูลตามสิทธิ์บัญชี · รวมผลร่าง / รออนุมัติ · จัดทำ {today.toLocaleDateString("th-TH")}</p></div><div className="flex gap-2 flex-wrap print:hidden"><Button disabled={busy} onClick={download}><Download className="size-4 mr-2"/>{busy?"กำลังรวบรวม…":"ดาวน์โหลดชุดสรุป"}</Button><Button variant="outline" onClick={()=>window.print()}><Printer className="size-4 mr-2"/>พิมพ์ / PDF</Button></div></header>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y py-5">{[["KPI ผ่านเป้า",`${passed}/${kpis.filter(r=>r.average!=null).length}`],["NC/CAPA",data.capa.length],["CAPA ยังไม่ปิด",open.length],["ปัญหาบันทึก / หลักฐาน",issues.length]].map(([label,v])=><div key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold">{v}</p></div>)}</div>
 <div><h2 className="text-lg font-semibold mb-3">ผล Objective / KPI ประจำปี</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">ตัวชี้วัด</th><th className="p-2">ค่าเฉลี่ย</th><th className="p-2">เป้าหมาย</th><th className="p-2">ผล</th></tr></thead><tbody>{data.rows.filter(r=>["objective","object","kpi"].includes(r.ind.level)).map(r=><tr key={r.ind.id} className="border-b"><td className="p-2">{r.ind.code} · {r.ind.name_th}</td><td className="p-2 text-center">{formatIndicatorValue(r.ind.code,r.average)}</td><td className="p-2 text-center">{formatIndicatorValue(r.ind.code,r.ind.target_value)}</td><td className="p-2 text-center">{statusLabel(toneFor(r.average,r.ind.target_value,r.ind.target_condition,r.ind.is_inverted))}</td></tr>)}</tbody></table></div></div>
 <div><h2 className="text-lg font-semibold">สรุปสาเหตุ NC</h2><ParetoChart causes={data.capa.map(c=>c.root_cause)}/></div>
 <div><h2 className="text-lg font-semibold mb-3">NC / CAPA ที่ยังไม่ปิด</h2>{open.length===0?<p className="text-muted-foreground">ไม่มีรายการ</p>:<ul className="divide-y">{open.map(c=><li key={c.id} className="py-3 text-sm"><b>{data.rows.find(r=>r.ind.id===c.indicator_id)?.ind.code}</b> · {c.problem_description}<p className="text-muted-foreground">แผน: {c.action_plan} · ผู้รับผิดชอบ: {c.responsible_person||"ยังไม่ระบุ"} · กำหนด: {c.due_date||"ยังไม่ระบุ"}</p></li>)}</ul>}</div>
 <div><h2 className="text-lg font-semibold mb-3">ปัญหาการบันทึกและหลักฐาน</h2><div className="overflow-x-auto max-h-96 print:max-h-none"><table className="w-full text-sm"><tbody>{issues.map((r,i)=><tr key={i} className="border-b">{r.map((c,j)=><td key={j} className="p-2">{c}</td>)}</tr>)}</tbody></table></div>{issues.length===0&&<p className="text-muted-foreground">ไม่มีปัญหาในเดือนที่ครบกำหนด</p>}</div>
 <div><h2 className="text-lg font-semibold mb-3">ข้อเสนอเพื่อพิจารณา</h2><ul className="list-disc pl-5 space-y-2 text-sm">{recommendations.map(r=><li key={r}>{r}</li>)}</ul></div><footer className="border-t pt-4 text-sm text-muted-foreground">มติที่ประชุม / ผู้รับผิดชอบ / กำหนดดำเนินการ: ____________________<br/>ชุดข้อมูลประกอบการประชุม ไม่ใช่ข้อสรุปการรับรองมาตรฐาน</footer></section>;
}