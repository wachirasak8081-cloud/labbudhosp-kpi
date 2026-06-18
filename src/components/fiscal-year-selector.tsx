import { useState } from "react";
import { fiscalYearOptions } from "@/lib/fiscal-year";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function FiscalYearSelector() {
  const { fiscalYear, setFiscalYear, customYears, addCustomYear } = useFiscalYear();
  const { hasAnyRole } = useAuth();
  const canAdd = hasAnyRole(["admin", "manager"]);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const opts = fiscalYearOptions(customYears);

  const handleAdd = () => {
    const y = parseInt(value, 10);
    if (!y || y < 2500 || y > 2700) { toast.error("กรุณากรอกปี พ.ศ. ที่ถูกต้อง"); return; }
    addCustomYear(y);
    setOpen(false);
    setValue("");
    toast.success(`เพิ่มปีงบประมาณ ${y} แล้ว`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">ปีงบประมาณ</span>
      <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(parseInt(v, 10))}>
        <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      {canAdd && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" title="เพิ่มปีงบประมาณ"><Plus className="w-4 h-4" /></Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>เพิ่มปีงบประมาณ</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="fy">ปี พ.ศ.</Label>
              <Input id="fy" inputMode="numeric" placeholder="เช่น 2571" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleAdd}>เพิ่ม</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
