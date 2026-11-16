import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery,useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { qualityOptions } from "@/lib/quality-data";
import { qualityHead } from "@/lib/quality-head";
import { failingStreak, controlStats } from "@/lib/quality-analysis";
import { TrendChart, ParetoChart } from "@/components/quality-charts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from "@/components/ui/select";
import { THAI_MONTHS,FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue } from "@/lib/indicator-format";
export const Route=createFileRoute("/_authenticated/analysis")({head:()=>qualityHead("วิเคราะห์คุณภาพและแนวโน้ม","Run chart, I-MR control chart, Pareto สาเหตุ NC และเสนอ CAPA หลังไม่ผ่านสามเดือนต่อเนื่อง"),component:Analysis});
function Analysis(){
 const {fiscalYear}=useFiscalYear();const {data}=useSuspenseQuery(qualityOptions(fiscalYear));const {hasAnyRole}=useAuth();const qc=useQueryClient();
 const [id,setId]=useState("");const [mode,setMode]=useState("run");const [group,setGroup]=useState("cause");const [selected,setSelected]=useState<{id:string;month:number;description:string}|null>(null);const [plan,setPlan]=useState("");const [busy,setBusy]=useState(false);
 const row=data.rows.find(r=>r.ind.id===id)??data.rows.find(r=>r.ind.level==="kpi")??data.rows[0];
 const suggestions=data.rows.flatMap(r=>failingStreak([...r.priorMonthly.slice(-2),...r.monthly],r.ind.target_value,r.ind.target_condition,!!r.ind.is_inverted).filter(end=>end>=2).map(end=>({r,index:end-2}))).filter(s=>!data.capa.some(c=>c.indicator_id===s.r.ind.id&&c.period_month===FISCAL_MONTH_TO_CAL[s.index]&&c.status!=="closed"));
 const submit=async()=>{if(!selected)return;setBusy(true);try{const {error}=await supabase.rpc("open_streak_capa",{p_indicator:selected.id,p_year:fiscalYear,p_month:selected.month,p_plan:plan});if(error)throw error;toast.success("เปิด / เชื่อม CAPA แล้ว");setSelected(null);void qc.invalidateQueries({queryKey:["quality"]});void qc.invalidateQueries({queryKey:["capa"]});}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const stats=row?controlStats(row.monthly):null;
 return <section className="space-y-6"><h1 className="text-2xl font-semibold">วิเคราะห์คุณภาพและแนวโน้ม</h1><div className="flex flex-wrap gap-3"><Select value={row?.ind.id??""} onValueChange={setId}><SelectTrigger className="w-full sm:max-w-xl"><SelectValue/></SelectTrigger><SelectContent>{data.rows.map(r=><SelectItem key={r.ind.id} value={r.ind.id}>{r.ind.code} {r.ind.name_th}</SelectItem>)}</SelectContent></Select><Select value={mode} onValueChange={setMode}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="run">Run chart</SelectItem><SelectItem value="control">Control chart (I-MR)</SelectItem></SelectContent></Select></div>
 {row&&<><h2 className="font-semibold">{row.ind.code} · {row.ind.name_th}</h2><TrendChart values={row.monthly} code={row.ind.code} target={row.ind.target_value} control={mode==="control"}/>{mode==="control"&&stats&&<p className="text-sm text-destructive">จุดนอกขีดควบคุม: {row.monthly.flatMap((v,i)=>v!=null&&stats.ucl!=null&&stats.lcl!=null&&(v>stats.ucl||v<stats.lcl)?[THAI_MONTHS[i]]:[]).join(", ")||"ไม่มี"}</p>}</>}
 <div className="border-t pt-5"><div className="flex justify-between flex-wrap gap-3"><h2 className="text-lg font-semibold">Pareto · NC / อุบัติการณ์</h2><Select value={group} onValueChange={setGroup}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cause">สาเหตุราก</SelectItem><SelectItem value="source">แหล่งที่มา</SelectItem></SelectContent></Select></div><ParetoChart causes={data.capa.map(c=>group==="cause"?c.root_cause:c.nc_source)}/></div>
 <div className="border-t pt-5"><h2 className="text-lg font-semibold">ไม่ผ่านเป้าหมาย 3 เดือนต่อเนื่อง</h2>{suggestions.length===0?<p className="py-5 text-muted-foreground">ไม่มีรายการใหม่ที่เข้าเกณฑ์เสนอ CAPA</p>:<div className="divide-y">{suggestions.map(({r,index})=><div key={`${r.ind.id}-${index}`} className="py-3 flex items-center justify-between gap-3 flex-wrap"><div><b>{r.ind.code}</b> {r.ind.name_th}<p className="text-sm text-muted-foreground">สิ้นสุด {THAI_MONTHS[index]} · ค่าจริง {formatIndicatorValue(r.ind.code,r.monthly[index])} / เป้า {formatIndicatorValue(r.ind.code,r.ind.target_value)}</p></div>{hasAnyRole(["admin","manager","staff"])&&<Button variant="outline" onClick={()=>{setPlan("");setSelected({id:r.ind.id,month:FISCAL_MONTH_TO_CAL[index],description:`${r.ind.code} ${r.ind.name_th}\nเป้า ${formatIndicatorValue(r.ind.code,r.ind.target_value)}\n`+[...r.priorMonthly.slice(-2),...r.monthly].slice(index,index+3).map((v,k)=>`เดือน ${FISCAL_MONTH_TO_CAL[(index+k+10)%12]}: ${formatIndicatorValue(r.ind.code,v)}`).join("\n")});}}>เสนอเปิด CAPA</Button>}</div>)}</div>}<Button asChild variant="outline"><Link to="/capa">ดู NC / CAPA ทั้งหมด</Link></Button></div>
 <Dialog open={!!selected} onOpenChange={o=>{if(!o)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>Nonconformity · ไม่ผ่านต่อเนื่อง</DialogTitle></DialogHeader><pre className="whitespace-pre-wrap text-sm font-sans">{selected?.description}</pre><label htmlFor="streak-plan">แผนแก้ไขเบื้องต้น</label><Textarea id="streak-plan" value={plan} onChange={e=>setPlan(e.target.value)}/><Button disabled={!plan.trim()||busy} onClick={submit}>{busy?"กำลังบันทึก…":"ยืนยันเปิด CAPA"}</Button></DialogContent></Dialog></section>;
}
