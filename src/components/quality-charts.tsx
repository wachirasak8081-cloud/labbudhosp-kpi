import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import { controlStats, paretoCounts } from "@/lib/quality-analysis";
import { THAI_MONTHS } from "@/lib/fiscal-year";
import { formatIndicatorValue } from "@/lib/indicator-format";
export function TrendChart({values,code,target,control}:{values:(number|null)[];code:string;target:number|null;control:boolean}){
  const stats=controlStats(values);
  const data=values.map((value,i)=>({month:THAI_MONTHS[i],value}));
  return <><div className="h-80 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{left:12,right:22,top:25,bottom:10}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis domain={["auto","auto"]}/><Tooltip formatter={v=>formatIndicatorValue(code,Number(v))}/><Legend/><Line name="ผลรายเดือน" dataKey="value" stroke="var(--primary)" strokeWidth={2} connectNulls={false}/>{stats&&<ReferenceLine y={control?stats.center:stats.median} stroke="var(--success)" label={control?"ค่าเฉลี่ย":"มัธยฐาน"}/>} {target!=null&&<ReferenceLine y={target} stroke="var(--warning)" strokeDasharray="5 5" label="เป้าหมาย"/>}{control&&stats?.ucl!=null&&<ReferenceLine y={stats.ucl} stroke="var(--destructive)" label="UCL"/>}{control&&stats?.lcl!=null&&<ReferenceLine y={stats.lcl} stroke="var(--destructive)" label="LCL"/>}</ComposedChart></ResponsiveContainer></div>
    {control&&<p className="text-xs text-muted-foreground">I-MR: ค่าเฉลี่ย ± 3 × MR̄ / 1.128 · {stats?.provisional?"ขีดควบคุมเบื้องต้น (น้อยกว่า 20 จุด)":"ขีดควบคุมจากข้อมูลที่แสดง"} · {stats?.sigma==null?"ข้อมูลคู่เดือนติดกันไม่เพียงพอ":""}</p>}</>;
}
export function ParetoChart({causes}:{causes:(string|null)[]}){
 const data=paretoCounts(causes);
 if(!data.length)return <p className="text-muted-foreground py-12 text-center">ยังไม่มี NC / อุบัติการณ์ในปีนี้</p>;
 return <div className="h-80 min-w-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{left:10,right:12,bottom:35}}><CartesianGrid stroke="var(--border)"/><XAxis dataKey="name" tick={{fontSize:11}} interval={0} tickFormatter={v=>String(v).length>16?String(v).slice(0,16)+"…":v}/><YAxis yAxisId="count" allowDecimals={false}/><YAxis yAxisId="percent" orientation="right" domain={[0,100]} unit="%"/><Tooltip/><Legend/><Bar yAxisId="count" dataKey="count" name="จำนวน NC" fill="var(--chart-3)"/><Line yAxisId="percent" dataKey="cumulative" name="สะสม (%)" stroke="var(--chart-2)"/><ReferenceLine yAxisId="percent" y={80} stroke="var(--warning)" strokeDasharray="4 4"/></ComposedChart></ResponsiveContainer></div>;
}