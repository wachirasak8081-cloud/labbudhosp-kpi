import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Download, Trash2, Upload, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validateEvidence } from "@/lib/quality-analysis";

export function MeasurementEvidence({ measurementId, label, readOnly = false, approved = false }: { measurementId:string; label:string; readOnly?:boolean; approved?:boolean }) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const { user,hasAnyRole,hasRole }=useAuth();
  const qc=useQueryClient();
  const canWrite=!readOnly && hasAnyRole(["staff","manager","admin"]) && (!approved || hasRole("admin"));
  const { data:files=[],isError }=useQuery({queryKey:["evidence",measurementId], enabled:open, queryFn:async()=>{
    const {data,error}=await supabase.from("measurement_evidence").select("*").eq("measurement_id",measurementId).order("uploaded_at");
    if(error) throw error; return data??[];
  }});
  const [linkUrl,setLinkUrl]=useState("");
  const [linkName,setLinkName]=useState("");
  const [showLink,setShowLink]=useState(false);
  const refresh=()=>{ void qc.invalidateQueries({queryKey:["evidence"]}); void qc.invalidateQueries({queryKey:["quality"]}); };
  const addLink=async()=>{
    if(!user) return;
    const url=linkUrl.trim();
    if(!/^https?:\/\/\S+$/i.test(url)){toast.error("กรุณาวางลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://");return;}
    setBusy(true);
    try{
      const {error}=await supabase.from("measurement_evidence").insert({measurement_id:measurementId,file_name:linkName.trim()||url,storage_path:url,mime_type:"link/url",size_bytes:0,uploaded_by:user.id});
      if(error)throw error;
      setLinkUrl("");setLinkName("");setShowLink(false);refresh();toast.success("แนบลิงก์เรียบร้อย");
    }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
  };
  const upload=async(file:File)=>{
    if(!user) return;
    const invalid=validateEvidence(file.type,file.size); if(invalid){toast.error(invalid);return;}
    setBusy(true);
    const ext=file.name.split(".").pop()?.replace(/[^a-z0-9]/gi,"")||"file";
    const path=`${measurementId}/${user.id}/${crypto.randomUUID()}.${ext}`;
    try {
      const {error}=await supabase.storage.from("measurement-evidence").upload(path,file,{contentType:file.type}); if(error)throw error;
      const {error:saveError}=await supabase.from("measurement_evidence").insert({measurement_id:measurementId,file_name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size,uploaded_by:user.id});
      if(saveError){await supabase.storage.from("measurement-evidence").remove([path]);throw saveError;}
      refresh();toast.success("แนบหลักฐานเรียบร้อย");
    }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
  };
  const download=async(path:string,isLink:boolean)=>{
    if(isLink){window.open(path,"_blank","noopener,noreferrer");return;}
    const {data,error}=await supabase.storage.from("measurement-evidence").createSignedUrl(path,300);
    if(error||!data){toast.error("เปิดหลักฐานไม่สำเร็จ");return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");
  };
  const remove=async(id:string,path:string,isLink:boolean)=>{
    if(!window.confirm("ยืนยันลบหลักฐานนี้?"))return;
    setBusy(true);
    try{
      if(!isLink){const {error}=await supabase.storage.from("measurement-evidence").remove([path]);if(error)throw error;}
      const {error:del}=await supabase.from("measurement_evidence").delete().eq("id",id);if(del)throw del;refresh();
    }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
  };
  return <><Button variant="outline" size="sm" onClick={()=>setOpen(true)} aria-label={`หลักฐาน ${label}`}><Paperclip className="size-4 mr-1"/>หลักฐาน</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>หลักฐาน · {label}</DialogTitle></DialogHeader>
      {isError?<p className="text-destructive">โหลดหลักฐานไม่สำเร็จ</p>:files.length===0?<p className="text-muted-foreground">ยังไม่มีหลักฐาน</p>:<ul className="divide-y">{files.map(f=>{const isLink=f.mime_type==="link/url";return <li key={f.id} className="flex items-center gap-2 py-3"><div className="flex-1 min-w-0"><p className="break-all text-sm flex items-center gap-1">{isLink&&<Link2 className="size-3.5 shrink-0 text-muted-foreground"/>}{f.file_name}</p><p className="text-xs text-muted-foreground">{isLink?"ลิงก์ภายนอก":`${(f.size_bytes/1024).toFixed(0)} KB`} · {new Date(f.uploaded_at).toLocaleDateString("th-TH")}</p></div><Button size="icon" variant="ghost" title="เปิดหลักฐาน" onClick={()=>download(f.storage_path,isLink)}>{isLink?<ExternalLink className="size-4"/>:<Download className="size-4"/>}</Button>{canWrite&&(f.uploaded_by===user?.id||hasRole("admin"))&&<Button size="icon" variant="ghost" title="ลบหลักฐาน" disabled={busy} onClick={()=>remove(f.id,f.storage_path,isLink)}><Trash2 className="size-4"/></Button>}</li>;})}</ul>}
      {canWrite&&<><input ref={input} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>input.current?.click()}><Upload className="size-4 mr-2"/>{busy?"กำลังแนบ…":"แนบเอกสาร / ภาพ"}</Button><Button variant="outline" disabled={busy} onClick={()=>setShowLink(v=>!v)}><Link2 className="size-4 mr-2"/>แนบลิงก์</Button></div>
      {showLink&&<div className="space-y-2 rounded-md border p-3"><input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="วางลิงก์ เช่น https://drive.google.com/..." value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/><input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="ชื่อหลักฐาน (ไม่บังคับ)" value={linkName} onChange={e=>setLinkName(e.target.value)}/><Button size="sm" disabled={busy} onClick={()=>void addLink()}>บันทึกลิงก์</Button></div>}
      <p className="text-xs text-muted-foreground">PDF · Word · Excel · PNG · JPG · WebP / ไม่เกิน 10 MB · หรือแนบเป็นลิงก์ภายนอก · ไม่แนบข้อมูลระบุตัวผู้ป่วย</p></>}
    </DialogContent></Dialog></>;
}