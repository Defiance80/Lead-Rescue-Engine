// Small, reusable visual pieces (server-safe — no hooks here).

import Link from "next/link";
import clsx from "clsx";
import type { LeadStatus } from "@prisma/client";
import { tierFor } from "@/lib/tiers";

export function TierChip({ score, className }: { score: number; className?: string }) {
  const t = tierFor(score);
  return (
    <span className={clsx("chip", t.chip, className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", t.dot)} />
      {t.label}
    </span>
  );
}

export function ScoreRing({ score, size = 56, stroke = 6 }: { score: number; size?: number; stroke?: number }) {
  const t = tierFor(score);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const colors: Record<string, [string, string]> = {
    ready: ["#fb7185", "#d946ef"],
    hot: ["#fb923c", "#fbbf24"],
    warming: ["#fbbf24", "#fde047"],
    nurture: ["#06b6d4", "#38bdf8"],
    longgame: ["#64748b", "#94a3b8"],
  };
  const [a, b] = colors[t.key];
  const id = `ring-${t.key}-${size}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Score ${score} · ${t.label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.max(score, 2) / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-sm font-bold text-white" style={{ fontSize: size * 0.3 }}>
        {score}
      </span>
    </div>
  );
}

export const STATUS_META: Record<LeadStatus, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30" },
  CONTACTED: { label: "Reached out", cls: "bg-sky-500/15 text-sky-300 ring-sky-400/30" },
  ENGAGED: { label: "In conversation", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  APPOINTMENT: { label: "Appointment set", cls: "bg-violet-500/15 text-violet-300 ring-violet-400/30" },
  CLIENT: { label: "Client", cls: "bg-lime-400/15 text-lime-300 ring-lime-300/30" },
  LONG_GAME: { label: "Long Game", cls: "bg-slate-400/15 text-slate-300 ring-slate-300/30" },
  CLOSED: { label: "Not moving forward", cls: "bg-slate-500/10 text-slate-400 ring-slate-400/20" },
};

export function StatusChip({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return <span className={clsx("chip", m.cls)}>{m.label}</span>;
}

const AVATAR_BG = [
  "from-ember-500 to-rose-500",
  "from-cyan-500 to-sky-500",
  "from-violet-500 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
];

export function Avatar({ first, last, size = "md" }: { first: string; last?: string | null; size?: "sm" | "md" | "lg" }) {
  const initials = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
  const hue = (first.charCodeAt(0) + (last?.charCodeAt(0) ?? 0)) % AVATAR_BG.length;
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-display font-bold text-white",
        AVATAR_BG[hue],
        size === "sm" && "h-8 w-8 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
      )}
    >
      {initials}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  accent = "text-ember-400",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  accent?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className={clsx("eyebrow", accent)}>{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "ember" | "cyan" | "violet" | "emerald" | "amber" | "rose" | "slate";
  href?: string;
}) {
  const tones = {
    ember: "text-ember-300 bg-ember-500/12",
    cyan: "text-cyan-300 bg-cyan-400/12",
    violet: "text-violet-300 bg-violet-400/12",
    emerald: "text-emerald-300 bg-emerald-400/12",
    amber: "text-amber-300 bg-amber-400/12",
    rose: "text-rose-300 bg-rose-400/12",
    slate: "text-slate-300 bg-white/5",
  } as const;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-400">{label}</span>
        <span className={clsx("grid h-8 w-8 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-pad block transition hover:border-white/15 hover:bg-ink-800">
      {inner}
    </Link>
  ) : (
    <div className="card card-pad">{inner}</div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  tone = "emerald",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  tone?: "emerald" | "cyan" | "ember";
}) {
  const t = {
    emerald: "bg-emerald-400/10 text-emerald-300",
    cyan: "bg-cyan-400/10 text-cyan-300",
    ember: "bg-ember-500/10 text-ember-300",
  }[tone];
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className={clsx("grid h-14 w-14 place-items-center rounded-2xl", t)}>
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold text-white">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, dot }: { children: React.ReactNode; right?: React.ReactNode; dot?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
        {dot && <span className={clsx("h-2 w-2 rounded-full", dot)} />}
        {children}
      </h2>
      {right}
    </div>
  );
}
