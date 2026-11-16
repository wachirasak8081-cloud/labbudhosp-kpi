import { describe, expect, it } from "vitest";
import { controlStats, failingStreak, paretoCounts, submissionDeadline, validateEvidence } from "../quality-analysis";
describe("quality rules", () => {
  it("requires 3 consecutive failing months", () => { expect(failingStreak([80,80],90,"gte",false)).toEqual([]); expect(failingStreak([80,80,80],90,"gte",false)).toEqual([2]); });
  it("missing and passing months break the streak", () => { expect(failingStreak([80,null,80,95,80,80],90,"gte",false)).toEqual([]); });
  it("handles upper and exact targets", () => { expect(failingStreak([2,2,2],1,"lte",false)).toEqual([2]); expect(failingStreak([2,2,2],1,"eq",false)).toEqual([2]); });
  it("submission deadline is 15th of next month including year rollover", () => { expect(submissionDeadline(2569,10).toISOString()).toBe("2025-11-15T00:00:00.000Z"); expect(submissionDeadline(2569,12).toISOString()).toBe("2026-01-15T00:00:00.000Z"); });
  it("computes XmR limits from adjacent points", () => { const s=controlStats([10,12,14]); expect(s?.center).toBe(12); expect(s?.sigma).toBeCloseTo(2/1.128); expect(s?.ucl).toBeCloseTo(12+3*2/1.128); });
  it("does not bridge missing points", () => { expect(controlStats([10,null,14])?.sigma).toBeNull(); });
  it("Pareto orders causes and totals to 100%", () => { const rows=paretoCounts(["A","B","A"]); expect(rows.map(r=>[r.name,r.count])).toEqual([["A",2],["B",1]]); expect(rows[0].cumulative).toBeCloseTo(200/3); expect(rows[1].cumulative).toBe(100); });
  it("rejects executable evidence and oversized files", () => { expect(validateEvidence("text/html",1)).not.toBeNull(); expect(validateEvidence("image/png",10*1024*1024+1)).not.toBeNull(); expect(validateEvidence("image/png",10*1024*1024)).toBeNull(); });
});