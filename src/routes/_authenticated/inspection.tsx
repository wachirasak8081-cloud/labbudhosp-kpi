import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { qualityOptions } from "@/lib/quality-data";
import { qualityHead } from "@/lib/quality-head";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MeasurementEvidence } from "@/components/measurement-evidence";
import { FISCAL_MONTH_TO_CAL, THAI_MONTHS } from "@/lib/fiscal-year";
import { formatIndicatorValue } from "@/lib/indicator-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export const Route=createFileRoute("/_authenticated/inspection")({head:()=>qualityHead("ตรวจประเมินย้อนหลัง","ผลรายเดือนและหลักฐานย้อนหลังสำหรับผู้ตรวจประเมิน ISO 15189 และ HA แบบอ่านอย่างเดียว"),component:Inspection});
function Inspection(){
 const {fiscalYear}=useFiscalYear();const {data}=useSuspenseQuery(qualityOptions(fiscalYear));const [search,setSearch]=useState("");const [month,setMonth]=useState("all");
 return <section className="space-y-5"><div className="flex gap-3 items-center flex-wrap"><h1 className="text-2xl font-semibold">ตรวจประเมินย้อนหลัง</h1><Badge variant="secondary">อ่านอย่างเดียว</Badge><span className="text-muted-foreground">ปีงบประมาณ {fiscalYear}</span></div>
 <div className="flex flex-wrap gap-3"><Input aria-label="ค้นหาตัวชี้วัด" placeholder="ค้นหารหัสหรือชื่อตัวชี้วัด" className="max-w-md" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={month} onValueChange={setMonth}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">ทุกเดือน</SelectItem>{FISCAL_MONTH_TO_CAL.map((m,i)=><SelectItem key={m} value={String(m)}>{THAI_MONTHS[i]}</SelectItem>)}</SelectContent></Select></div>
 <div className="overflow-x-auto border rounded-md"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">ตัวชี้วัด</th><th className="p-3">ค่าเฉลี่ย</th><th className="p-3">ผลรายเดือน / หลักฐาน</th></tr></thead><tbody>{data.rows.filter(r=>`${r.ind.code} ${r.ind.name_th}`.toLowerCase().includes(search.toLowerCase())).map(r=><tr key={r.ind.id} className="border-t align-top"><td className="p-3 min-w-52"><b>{r.ind.code}</b><p>{r.ind.name_th}</p></td><td className="p-3 font-mono">{formatIndicatorValue(r.ind.code,r.average)}</td><td className="p-3 min-w-72"><div className="grid gap-2">{FISCAL_MONTH_TO_CAL.map((m,i)=>{if(month!=="all"&&Number(month)!==m)return null;const measurement=data.measurements.find(x=>x.indicator_id===r.ind.id&&x.period_month===m);return <div key={m} className="flex items-center gap-3"><span className="w-10 text-muted-foreground">{THAI_MONTHS[i]}</span><span className="w-20 font-mono">{formatIndicatorValue(r.ind.code,r.monthly[i])}</span>{measurement&&<><Badge variant="outline">{measurement.status==="approved"?"อนุมัติ":measurement.status==="submitted"?"รออนุมัติ":"ร่าง"}</Badge><MeasurementEvidence readOnly measurementId={measurement.id} label={`${r.ind.code} ${THAI_MONTHS[i]} ${fiscalYear}`}/><span className="text-xs text-muted-foreground">{data.evidence.filter(e=>e.measurement_id===measurement.id).length} ไฟล์</span></>}</div>;})}</div></td></tr>)}</tbody></table></div>
 {data.rows.length===0&&<p className="text-muted-foreground">ไม่มีข้อมูลในขอบเขตสิทธิ์ของบัญชีนี้</p>}</section>;
}
