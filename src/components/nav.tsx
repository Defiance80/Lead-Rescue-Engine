"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Gauge,
  Flame,
  Crosshair,
  ShieldCheck,
  LifeBuoy,
  Users,
  Send,
  Trophy,
  Settings,
  Plus,
} from "lucide-react";

export type NavCounts = { priority: number; safety: number; rescue: number };

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  count?: keyof NavCounts;
  badge?: string;
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Act now",
    items: [
      { href: "/today", label: "Today", icon: Gauge, color: "text-ember-400" },
      { href: "/priority", label: "Priority Lane", icon: Flame, color: "text-rose-400", count: "priority", badge: "bg-rose-500 text-white" },
      { href: "/focus", label: "Focus Mode", icon: Crosshair, color: "text-fuchsia-400" },
    ],
  },
  {
    title: "Protect",
    items: [
      { href: "/safety-net", label: "Safety Net", icon: ShieldCheck, color: "text-amber-300", count: "safety", badge: "bg-amber-400 text-ink-950" },
      { href: "/rescue", label: "Rescue Queue", icon: LifeBuoy, color: "text-cyan-300", count: "rescue", badge: "bg-cyan-400 text-ink-950" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { href: "/leads", label: "All Leads", icon: Users, color: "text-sky-300" },
      { href: "/autopilot", label: "Autopilot", icon: Send, color: "text-violet-300" },
      { href: "/scoreboard", label: "Scoreboard", icon: Trophy, color: "text-emerald-300" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function isActive(path: string, href: string) {
  return path === href || (href !== "/today" && path.startsWith(href + "/")) || (href === "/leads" && path.startsWith("/leads"));
}

export function Sidebar({ counts }: { counts: NavCounts }) {
  const path = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-6">
      <Link href="/leads/new" className="btn-primary w-full">
        <Plus className="h-4 w-4" /> Add a lead
      </Link>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="eyebrow mb-2 px-3 text-slate-500">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href) && !(it.href === "/leads" && path === "/leads/new");
              const n = it.count ? counts[it.count] : 0;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={clsx(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active ? "bg-white/[0.07] text-white shadow-[inset_2px_0_0_0] shadow-ember-400" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                    )}
                  >
                    <it.icon className={clsx("h-[18px] w-[18px]", active ? it.color : "text-slate-500 group-hover:text-slate-200")} />
                    <span className="flex-1">{it.label}</span>
                    {n > 0 && it.badge && (
                      <span className={clsx("min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold", it.badge)}>{n}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto">
        <Link
          href="/settings"
          className={clsx(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
            path.startsWith("/settings") ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
          )}
        >
          <Settings className="h-[18px] w-[18px]" /> Settings & Connections
        </Link>
      </div>
    </nav>
  );
}

export function MobileNav({ counts }: { counts: NavCounts }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {[...ALL, { href: "/settings", label: "Settings", icon: Settings, color: "text-slate-300" } as NavItem].map((it) => {
        const active = isActive(path, it.href);
        const n = it.count ? counts[it.count] : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
              active ? "bg-white/10 text-white ring-white/15" : "text-slate-400 ring-white/5",
            )}
          >
            <it.icon className={clsx("h-3.5 w-3.5", it.color)} />
            {it.label}
            {n > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
