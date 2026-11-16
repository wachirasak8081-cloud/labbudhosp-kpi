import { sortIndicators } from "./indicator-sort";

type HierarchyIndicator = {
  id: string;
  parent_id: string | null;
  code: string;
  level: string;
};

// Walk actual parent links rather than inferring relationships from codes.
export function indicatorBranch<T extends HierarchyIndicator>(indicators: T[], rootId: string) {
  const children = new Map<string, T[]>();
  for (const indicator of sortIndicators(indicators)) {
    if (!indicator.parent_id) continue;
    const siblings = children.get(indicator.parent_id) ?? [];
    siblings.push(indicator);
    children.set(indicator.parent_id, siblings);
  }
  const result: { indicator: T; depth: number }[] = [];
  const visited = new Set<string>();
  const visit = (indicator: T, depth: number) => {
    if (visited.has(indicator.id)) return;
    visited.add(indicator.id);
    result.push({ indicator, depth });
    for (const child of children.get(indicator.id) ?? []) visit(child, depth + 1);
  };
  const root = indicators.find(indicator => indicator.id === rootId);
  if (root) visit(root, 0);
  return result;
}

export function analysisScopes<T extends HierarchyIndicator>(indicators: T[]) {
  const roots = sortIndicators(indicators.filter(indicator => ["object", "objective"].includes(indicator.level)));
  const entries = roots.flatMap(root => indicatorBranch(indicators, root.id)
    .filter(({ indicator }) => ["object", "objective", "kpi"].includes(indicator.level)));
  const included = new Set(entries.map(({ indicator }) => indicator.id));
  return [...entries, ...sortIndicators(indicators.filter(indicator => indicator.level === "kpi" && !included.has(indicator.id)))
    .map(indicator => ({ indicator, depth: 0 }))];
}