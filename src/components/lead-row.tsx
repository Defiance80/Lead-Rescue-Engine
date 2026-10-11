import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Hand, MapPin, PauseCircle } from "lucide-react";
import type { Lead, Touch } from "@prisma/client";
import { Avatar, ScoreRing, StatusChip, TierChip } from "./ui";
import { SpeedClock } from "./client";
import { ago, priceRange } from "@/lib/time";
import { tierFor } from "@/lib/tiers";

export function LeadRow({ lead, next, reason }: { lead: Lead; next?: Touch; reason?: string }) {
  const t = tierFor(lead.score);
  const where = lead.property ?? lead.city;
  const budget = priceRange(lead.priceMin, lead.priceMax);
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/70 p-4 transition hover:border-white/15 hover:bg-ink-800"
    >
      <span className={clsx("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <Avatar first={lead.firstName} last={lead.lastName} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-white">
            {lead.firstName} {lead.lastName}
          </span>
          <TierChip score={lead.score} />
          {lead.needsAgent && (
            <span className="chip bg-rose-500/90 text-white ring-rose-300/40">
              <Hand className="h-3 w-3" /> Wants you
            </span>
          )}
          {!lead.autopilot && !lead.needsAgent && lead.status !== "CLIENT" && lead.status !== "CLOSED" && lead.status !== "LONG_GAME" && (
            <span className="chip bg-white/5 text-slate-400 ring-white/10">
              <PauseCircle className="h-3 w-3" /> Autopilot off
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-400">
          {where && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              {where}
            </span>
          )}
          {budget && <span>{budget}</span>}
          <span className="text-slate-500">{lead.source} · {ago(lead.createdAt)}</span>
        </div>
        {(reason || next) && (
          <div className="mt-2 text-[13px] font-medium text-slate-300">
            {reason ?? (
              <>
                <span className="text-slate-500">Next: </span>
                {next!.label} · <span className={next!.dueAt <= new Date() ? "text-amber-300" : "text-slate-400"}>{next!.dueAt <= new Date() ? "due now" : ago(next!.dueAt)}</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="hidden flex-col items-end gap-2 sm:flex">
        <SpeedClock since={lead.createdAt.toISOString()} respondedAt={lead.firstResponseAt?.toISOString() ?? null} />
        <StatusChip status={lead.status} />
      </div>
      <ScoreRing score={lead.score} size={48} stroke={5} />
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </Link>
  );
}
