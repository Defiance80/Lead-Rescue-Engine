// Lead "temperature" tiers. Same names + colors everywhere in the app so the
// eye learns them once and can scan a list without reading.

export type TierKey = "ready" | "hot" | "warming" | "nurture" | "longgame";

export type Tier = {
  key: TierKey;
  label: string;
  hint: string;
  min: number; // inclusive score floor
  // Tailwind classes (kept as full strings so Tailwind can find them)
  chip: string;
  dot: string;
  bar: string;
  text: string;
};

export const TIERS: Tier[] = [
  {
    key: "ready",
    label: "Ready Now",
    hint: "Reach out personally today",
    min: 80,
    chip: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
    dot: "bg-rose-400",
    bar: "bg-gradient-to-r from-rose-500 to-fuchsia-500",
    text: "text-rose-300",
  },
  {
    key: "hot",
    label: "Hot",
    hint: "Strong intent — keep momentum",
    min: 60,
    chip: "bg-orange-500/15 text-orange-300 ring-orange-400/40",
    dot: "bg-orange-400",
    bar: "bg-gradient-to-r from-orange-500 to-amber-400",
    text: "text-orange-300",
  },
  {
    key: "warming",
    label: "Warming Up",
    hint: "Engaged and listening",
    min: 40,
    chip: "bg-amber-400/15 text-amber-200 ring-amber-300/40",
    dot: "bg-amber-300",
    bar: "bg-gradient-to-r from-amber-400 to-yellow-300",
    text: "text-amber-200",
  },
  {
    key: "nurture",
    label: "Nurture",
    hint: "Autopilot is keeping them warm",
    min: 20,
    chip: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/40",
    dot: "bg-cyan-300",
    bar: "bg-gradient-to-r from-cyan-500 to-sky-400",
    text: "text-cyan-200",
  },
  {
    key: "longgame",
    label: "Long Game",
    hint: "Planted seeds — check back later",
    min: 0,
    chip: "bg-slate-400/15 text-slate-300 ring-slate-300/30",
    dot: "bg-slate-400",
    bar: "bg-gradient-to-r from-slate-500 to-slate-400",
    text: "text-slate-300",
  },
];

export function tierFor(score: number): Tier {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}

export function tierByKey(key: string | undefined): Tier | undefined {
  return TIERS.find((t) => t.key === key);
}

export function tierRange(key: TierKey): { gte: number; lt: number } {
  const i = TIERS.findIndex((t) => t.key === key);
  return { gte: TIERS[i].min, lt: i === 0 ? 101 : TIERS[i - 1].min };
}
