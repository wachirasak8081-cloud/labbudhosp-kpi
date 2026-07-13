import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { KANBAN_COLUMNS, SEVERITY_LABEL, SEVERITY_TONE, kanbanColumnOf } from "@/lib/capa-helpers";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Row = {
  id: string; indicator_id: string; problem_description: string; responsible_person: string | null;
  due_date: string | null; status: string; pdca_phase: string | null; approval_status: string | null;
  severity: string | null;
};

type ColId = "pending" | "in_progress" | "check" | "done";

function DraggableCard({ row, indMap, onOpen }: { row: Row; indMap: Map<string, { code: string; name_th: string }>; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  const ind = indMap.get(row.indicator_id);
  const overdue = row.due_date && new Date(row.due_date) < new Date();
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onOpen(); } }}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.5 : 1 }}
      className="bg-white border rounded-md p-2 text-xs space-y-1 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-semibold text-primary">{ind?.code}</span>
        {row.severity && <Badge className={SEVERITY_TONE[row.severity as keyof typeof SEVERITY_TONE] + " text-[10px] px-1.5 py-0"}>{SEVERITY_LABEL[row.severity as keyof typeof SEVERITY_LABEL]}</Badge>}
      </div>
      <div className="text-slate-700 line-clamp-2">{row.problem_description}</div>
      {row.responsible_person && <div className="text-slate-500">👤 {row.responsible_person}</div>}
      {row.due_date && <div className={overdue ? "text-rose-600 font-semibold" : "text-slate-500"}>📅 {row.due_date}</div>}
    </div>
  );
}

function Column({ id, title, tone, children }: { id: ColId; title: string; tone: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${tone} border-2 ${isOver ? "border-primary" : ""} rounded-lg p-2 min-h-[400px] flex flex-col gap-2`}>
      <div className="font-semibold text-sm px-1 pb-1 border-b">{title}</div>
      <div className="space-y-2 flex-1">{children}</div>
    </div>
  );
}

export function KanbanTab({ rows, indMap, onOpen }: {
  rows: Row[];
  indMap: Map<string, { code: string; name_th: string }>;
  onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const move = useMutation({
    mutationFn: async ({ id, col }: { id: string; col: ColId }) => {
      const patch: Record<string, unknown> = {};
      if (col === "pending") { patch.pdca_phase = "plan"; patch.approval_status = "draft"; patch.status = "open"; }
      else if (col === "in_progress") {
        patch.pdca_phase = "do"; patch.status = "in_progress";
        if (hasAnyRole(["admin", "manager"])) { patch.approval_status = "approved"; patch.approved_by = user?.id; patch.approved_at = new Date().toISOString(); }
      }
      else if (col === "check") { patch.pdca_phase = "check"; patch.status = "in_progress"; }
      else if (col === "done") { patch.pdca_phase = "act"; patch.status = "closed"; patch.closed_at = new Date().toISOString(); }
      const { error } = await supabase.from("corrective_actions").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["capa"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const id = String(e.active.id);
    const col = e.over.id as ColId;
    const row = rows.find((r) => r.id === id);
    if (row && kanbanColumnOf(row) === col) return;
    move.mutate({ id, col });
  };

  const grouped: Record<ColId, Row[]> = { pending: [], in_progress: [], check: [], done: [] };
  rows.forEach((r) => grouped[kanbanColumnOf(r)].push(r));

  return (
    <DndContext sensors={sensors} onDragEnd={handleEnd}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {KANBAN_COLUMNS.map((c) => (
          <Column key={c.id} id={c.id} title={`${c.title} (${grouped[c.id].length})`} tone={c.tone}>
            {grouped[c.id].map((r) => (
              <DraggableCard key={r.id} row={r} indMap={indMap} onOpen={() => onOpen(r.id)} />
            ))}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
