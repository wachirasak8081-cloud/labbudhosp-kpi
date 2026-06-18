import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_FISCAL_YEAR } from "@/lib/fiscal-year";

interface FYContextValue {
  fiscalYear: number;
  setFiscalYear: (y: number) => void;
  customYears: number[];
  addCustomYear: (y: number) => void;
}
const Ctx = createContext<FYContextValue | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [fiscalYear, setFiscalYear] = useState<number>(DEFAULT_FISCAL_YEAR);
  const [customYears, setCustomYears] = useState<number[]>([]);
  const addCustomYear = (y: number) => {
    setCustomYears((cur) => (cur.includes(y) ? cur : [...cur, y]));
    setFiscalYear(y);
  };
  return <Ctx.Provider value={{ fiscalYear, setFiscalYear, customYears, addCustomYear }}>{children}</Ctx.Provider>;
}
export function useFiscalYear() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFiscalYear must be used within FiscalYearProvider");
  return c;
}
