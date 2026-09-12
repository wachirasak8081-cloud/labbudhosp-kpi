import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, AlertTriangle, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  // นับยอดยังไม่อ่านจากทั้งหมด ไม่ใช่แค่ 30 รายการล่าสุด
  const { data: unreadCount } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const localUnread = useMemo(() => (data ?? []).filter((n) => !n.is_read).length, [data]);
  const unread = unreadCount ?? localUnread;

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="การแจ้งเตือน">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 justify-center text-[10px] leading-none"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">การแจ้งเตือน</span>
          <Button
            variant="ghost" size="sm" className="h-7 text-xs"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" />อ่านทั้งหมด
          </Button>
        </div>
        <ScrollArea className="max-h-[320px]">
          {(data ?? []).length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="w-6 h-6" />ยังไม่มีการแจ้งเตือน
            </div>
          )}
          {(data ?? []).map((n) => {
            const inner = (
              <div className={`px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 ${n.is_read ? "" : "bg-primary/5"}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 shrink-0 ${n.type === "below_target" ? "text-rose-600" : "text-amber-600"}`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground break-words">{n.body}</div>}
                    <div className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => !n.is_read && markOne.mutate(n.id)} className="block">
                {inner}
              </Link>
            ) : (
              <div key={n.id} onClick={() => !n.is_read && markOne.mutate(n.id)}>{inner}</div>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
