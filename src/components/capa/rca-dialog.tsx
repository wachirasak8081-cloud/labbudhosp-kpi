import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, Send, Save, Trash2, X, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  APPROVAL_LABEL, EFFECTIVENESS_LABEL, FISHBONE_LABEL, PDCA_LABEL, SEVERITY_LABEL, SEVERITY_TONE,
  emptyFishbone, emptyFiveWhy, type FishboneCategory, type FishboneData, type FiveWhyStep, type RcaData,
} from "@/lib/capa-helpers";

type CAPA = {
  id: string; indicator_id: string; fiscal_year: number; period_month: number | null;
  problem_description: string; root_cause: string | null; action_plan: string;
  responsible_person: string | null; due_date: string | null; status: string;
  result_description: string | null;
  severity: string | null; priority: string | null; nc_source: string | null;
  nc_detected_date: string | null; rca_method: string | null; rca_data: unknown;
  containment_action: string | null; pdca_phase: string | null; approval_status: string | null;
  approved_by: string | null; approved_at: string | null; rejection_reason: string | null;
  verification_before: number | null; verification_1m: number | null; verification_3m: number | null;
  effectiveness: string | null; closed_at: string | null;
};

type Indicator = { id: string; code: string; name_th: string; target_value: number | null };

export function RcaDialog({ capa, indicator, onClose }: { capa: CAPA; indicator?: Indicator; onClose: () => void }) {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canApprove = hasAnyRole(["admin", "manager"]);

  const initRca = (capa.rca_data as RcaData) ?? {};
  const [rcaMethod, setRcaMethod] = useState<string>(capa.rca_method ?? "5why");
  const [fiveWhy, setFiveWhy] = useState<FiveWhyStep[]>(initRca.fiveWhy ?? emptyFiveWhy());
  const [fishbone, setFishbone] = useState<FishboneData>(initRca.fishbone ?? emptyFishbone());
  const [rootSummary, setRootSummary] = useState(initRca.rootCauseSummary ?? capa.root_cause ?? "");
  const [containment, setContainment] = useState(capa.containment_action ?? "");
  const [actionPlan, setActionPlan] = useState(capa.action_plan ?? "");
  const [responsible, setResponsible] = useState(capa.responsible_person ?? "");
  const [dueDate, setDueDate] = useState(capa.due_date ?? "");
  const [priority, setPriority] = useState(capa.priority ?? "P3");
  const [severity, setSeverity] = useState(capa.severity ?? "medium");
  const [rejection, setRejection] = useState("");

  const { data: attachments = [], refetch: refetchAtt } = useQuery({
    queryKey: ["capa-att", capa.id],
    queryFn: async () => {
      const { data } = await supabase.from("capa_attachments").select("*").eq("capa_id", capa.id).order("uploaded_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: comments = [], refetch: refetchCmt } = useQuery({
    queryKey: ["capa-cmt", capa.id],
    queryFn: async () => {
      const { data } = await supabase.from("capa_comments").select("*").eq("capa_id", capa.id).order("created_at", { ascending: true });
      return data ?? [];
    },
  });
  const [newComment, setNewComment] = useState("");

  const buildPayload = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const rca_data: RcaData = { rootCauseSummary: rootSummary };
    if (rcaMethod === "5why") rca_data.fiveWhy = fiveWhy;
    else if (rcaMethod === "fishbone") rca_data.fishbone = fishbone;
    return {
      rca_method: rcaMethod, rca_data,
      root_cause: rootSummary || null,
      containment_action: containment || null,
      action_plan: actionPlan || "(รอกำหนดแผนแก้ไข)",
      responsible_person: responsible || null,
      due_date: dueDate || null,
      priority, severity,
      ...extra,
    };
  };

  const save = useMutation({
    mutationFn: async (extra: Partial<CAPA> = {}) => {
      const { error } = await supabase.from("corrective_actions").update(buildPayload(extra) as never).eq("id", capa.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("บันทึกแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("corrective_actions").update(buildPayload({
        approval_status: "pending_manager", pdca_phase: "do", status: "in_progress",
      }) as never).eq("id", capa.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ส่งขออนุมัติแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("corrective_actions").update({
        approval_status: "approved", approved_by: user?.id, approved_at: new Date().toISOString(),
        pdca_phase: "do", status: "in_progress", rejection_reason: null,
      }).eq("id", capa.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("อนุมัติแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!rejection.trim()) throw new Error("กรุณาระบุเหตุผลตีกลับ");
      const { error } = await supabase.from("corrective_actions").update({
        approval_status: "rejected", rejection_reason: rejection,
      }).eq("id", capa.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ตีกลับแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadFile = async (file: File) => {
    const path = `${capa.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("capa-docs").upload(path, file);
    if (upErr) { toast.error("อัปโหลดล้มเหลว: " + upErr.message); return; }
    const { error: insErr } = await supabase.from("capa_attachments").insert({
      capa_id: capa.id, file_name: file.name, storage_path: path,
      mime_type: file.type, size_bytes: file.size, uploaded_by: user?.id,
    });
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("แนบไฟล์แล้ว");
    refetchAtt();
  };

  const downloadAtt = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("capa-docs").createSignedUrl(path, 3600);
    if (error || !data) { toast.error(error?.message ?? "ดาวน์โหลดไม่สำเร็จ"); return; }
    const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click();
  };

  const deleteAtt = async (id: string, path: string) => {
    await supabase.storage.from("capa-docs").remove([path]);
    await supabase.from("capa_attachments").delete().eq("id", id);
    refetchAtt();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const { error } = await supabase.from("capa_comments").insert({ capa_id: capa.id, user_id: user?.id, comment: newComment });
    if (error) { toast.error(error.message); return; }
    setNewComment(""); refetchCmt();
  };

  const setFishboneItem = (cat: FishboneCategory, idx: number, val: string) => {
    setFishbone((prev) => {
      const list = [...(prev.causes[cat] ?? [])];
      list[idx] = val;
      return { causes: { ...prev.causes, [cat]: list } };
    });
  };
  const addFishboneItem = (cat: FishboneCategory) => {
    setFishbone((prev) => ({ causes: { ...prev.causes, [cat]: [...(prev.causes[cat] ?? []), ""] } }));
  };
  const removeFishboneItem = (cat: FishboneCategory, idx: number) => {
    setFishbone((prev) => ({ causes: { ...prev.causes, [cat]: prev.causes[cat].filter((_, i) => i !== idx) } }));
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>RCA / PDCA — {indicator?.code} {indicator?.name_th}</span>
            <Badge className={SEVERITY_TONE[(capa.severity as keyof typeof SEVERITY_TONE) ?? "medium"]}>
              {SEVERITY_LABEL[(capa.severity as keyof typeof SEVERITY_LABEL) ?? "medium"]}
            </Badge>
            <Badge variant="outline">{PDCA_LABEL[(capa.pdca_phase as keyof typeof PDCA_LABEL) ?? "plan"]}</Badge>
            <Badge variant="outline">{APPROVAL_LABEL[(capa.approval_status as keyof typeof APPROVAL_LABEL) ?? "draft"]}</Badge>
          </DialogTitle>
        </DialogHeader>

        {capa.approval_status === "rejected" && capa.rejection_reason && (
          <div className="border border-rose-300 bg-rose-50 rounded p-3 text-sm">
            <div className="font-semibold text-rose-800">ตีกลับ:</div>
            <div className="text-rose-700">{capa.rejection_reason}</div>
          </div>
        )}

        <Tabs defaultValue="rca">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="rca">วิเคราะห์สาเหตุ (RCA)</TabsTrigger>
            <TabsTrigger value="plan">แผนแก้ไข</TabsTrigger>
            <TabsTrigger value="att">ไฟล์แนบ ({attachments.length})</TabsTrigger>
            <TabsTrigger value="cmt">ความคิดเห็น ({comments.length})</TabsTrigger>
          </TabsList>

          {/* --- RCA --- */}
          <TabsContent value="rca" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ระดับความรุนแรง</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">ความสำคัญเร่งด่วน</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 — เร่งด่วนสูงสุด</SelectItem>
                    <SelectItem value="P2">P2 — เร่งด่วน</SelectItem>
                    <SelectItem value="P3">P3 — ปกติ</SelectItem>
                    <SelectItem value="P4">P4 — ต่ำ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">การแก้ไขทันที (Containment)</Label>
              <Textarea rows={2} value={containment} onChange={(e) => setContainment(e.target.value)} placeholder="สิ่งที่ทำทันทีเพื่อควบคุมปัญหา..." />
            </div>

            <div>
              <Label className="text-xs">วิธีวิเคราะห์สาเหตุ</Label>
              <Select value={rcaMethod} onValueChange={setRcaMethod}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5why">5-Why Analysis</SelectItem>
                  <SelectItem value="fishbone">Fishbone (Ishikawa)</SelectItem>
                  <SelectItem value="other">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rcaMethod === "5why" && (
              <div className="space-y-2 border rounded p-3">
                {fiveWhy.map((s, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr] gap-2 items-start">
                    <div className="text-xs font-semibold pt-2">Why #{i + 1}</div>
                    <div className="space-y-1">
                      <Input placeholder={`ทำไม (${i + 1})...`} value={s.why} onChange={(e) => { const c = [...fiveWhy]; c[i] = { ...c[i], why: e.target.value }; setFiveWhy(c); }} />
                      <Input placeholder={`เพราะ...`} value={s.because} onChange={(e) => { const c = [...fiveWhy]; c[i] = { ...c[i], because: e.target.value }; setFiveWhy(c); }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rcaMethod === "fishbone" && (
              <div className="grid grid-cols-2 gap-3 border rounded p-3">
                {(Object.keys(FISHBONE_LABEL) as FishboneCategory[]).map((cat) => (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">{FISHBONE_LABEL[cat]}</Label>
                      <Button size="sm" variant="ghost" onClick={() => addFishboneItem(cat)}>+</Button>
                    </div>
                    {(fishbone.causes[cat] ?? []).map((v, i) => (
                      <div key={i} className="flex gap-1">
                        <Input value={v} onChange={(e) => setFishboneItem(cat, i, e.target.value)} placeholder="สาเหตุ..." className="text-xs" />
                        <Button size="icon" variant="ghost" onClick={() => removeFishboneItem(cat, i)}><X className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label className="text-xs">สรุปสาเหตุที่แท้จริง (Root Cause)</Label>
              <Textarea rows={2} value={rootSummary} onChange={(e) => setRootSummary(e.target.value)} />
            </div>
          </TabsContent>

          {/* --- Plan --- */}
          <TabsContent value="plan" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">แผนแก้ไข (Action Plan)</Label>
              <Textarea rows={4} value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">ผู้รับผิดชอบ</Label><Input value={responsible} onChange={(e) => setResponsible(e.target.value)} /></div>
              <div><Label className="text-xs">กำหนดเสร็จ</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            </div>
          </TabsContent>

          {/* --- Attachments --- */}
          <TabsContent value="att" className="space-y-3 pt-3">
            <div>
              <Input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
            </div>
            <div className="space-y-1">
              {attachments.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">ยังไม่มีไฟล์แนบ</div>}
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 border rounded p-2 text-sm">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{a.file_name}</span>
                  <span className="text-xs text-muted-foreground">{Math.round((a.size_bytes ?? 0) / 1024)} KB</span>
                  <Button size="icon" variant="ghost" onClick={() => downloadAtt(a.storage_path, a.file_name)}><Download className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteAtt(a.id, a.storage_path)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* --- Comments --- */}
          <TabsContent value="cmt" className="space-y-3 pt-3">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {comments.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">ยังไม่มีความคิดเห็น</div>}
              {comments.map((c) => (
                <div key={c.id} className="border rounded p-2 text-sm">
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("th-TH")}</div>
                  <div>{c.comment}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea rows={2} placeholder="เพิ่มความคิดเห็น..." value={newComment} onChange={(e) => setNewComment(e.target.value)} />
              <Button onClick={addComment}>ส่ง</Button>
            </div>
          </TabsContent>
        </Tabs>

        {canApprove && capa.approval_status === "pending_manager" && (
          <div className="border rounded p-3 bg-amber-50 space-y-2">
            <div className="text-sm font-semibold">การอนุมัติของผู้จัดการ</div>
            <Textarea rows={2} placeholder="เหตุผลตีกลับ (ถ้าตีกลับ)..." value={rejection} onChange={(e) => setRejection(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>อนุมัติ</Button>
              <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>ตีกลับ</Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          <Button variant="secondary" onClick={() => save.mutate({})} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}บันทึกร่าง
          </Button>
          {capa.approval_status !== "approved" && (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}ส่งขออนุมัติ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
