// Simple three-level view on top of the 0–100 score, plus priority.
//   Hot  = 60+   (Ready Now + Hot tiers)
//   Warm = 20–59 (Warming Up + Nurture)
//   Cold = under 20 (Long Game)

import type { Lead, Temperature } from "@prisma/client";

export const TEMPS: { key: Temperature; label: string; chip: string; dot: string }[] = [
  { key: "HOT", label: "Hot", chip: "bg-rose-500/15 text-rose-300 ring-rose-400/40", dot: "bg-rose-400" },
  { key: "WARM", label: "Warm", chip: "bg-amber-400/15 text-amber-200 ring-amber-300/40", dot: "bg-amber-300" },
  { key: "COLD", label: "Cold", chip: "bg-sky-400/15 text-sky-200 ring-sky-300/40", dot: "bg-sky-300" },
];

export function temperatureFor(score: number): Temperature {
  return score >= 60 ? "HOT" : score >= 20 ? "WARM" : "COLD";
}

export const tempMeta = (t: Temperature | null | undefined) => TEMPS.find((x) => x.key === t) ?? TEMPS[2];

export const PRIORITIES = [
  { value: 1, label: "High", chip: "bg-rose-500 text-white ring-rose-300/40" },
  { value: 2, label: "Medium", chip: "bg-amber-400/20 text-amber-200 ring-amber-300/40" },
  { value: 3, label: "Low", chip: "bg-white/5 text-slate-300 ring-white/10" },
] as const;

// What the agent set, or a sensible automatic level.
export function effectivePriority(l: Pick<Lead, "priority" | "needsAgent" | "score">): 1 | 2 | 3 {
  if (l.priority === 1 || l.priority === 2 || l.priority === 3) return l.priority;
  if (l.needsAgent || l.score >= 60) return 1;
  return l.score >= 20 ? 2 : 3;
}

export const priorityMeta = (p: number) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[2];
