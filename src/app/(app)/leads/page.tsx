import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Plus, Search, Users } from "lucide-react";
import type { LeadStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { TIERS, tierByKey, tierRange, type TierKey } from "@/lib/tiers";
import { EmptyState, PageHeader, STATUS_META } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";

export const metadata: Metadata = { title: "All Leads" };

type SP = { tier?: string; status?: string; q?: string; source?: string; sort?: string; view?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tier = tierByKey(sp.tier);
  const status = sp.status && sp.status in STATUS_META ? (sp.status as LeadStatus) : undefined;
  const q = sp.q?.trim();

  const where: Prisma.LeadWhereInput = {
    userId: user.id,
    ...(tier ? { score: tierRange(tier.key as TierKey) } : {}),
    ...(status ? { status } : sp.view === "all" ? {} : { status: { notIn: ["CLOSED"] } }),
    ...(sp.source ? { source: sp.source } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\D/g, "") || q } },
            { property: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, sources, counts] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: sp.sort === "new" ? { createdAt: "desc" } : [{ score: "desc" }, { createdAt: "desc" }],
      include: { touches: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" }, take: 1 } },
      take: 200,
    }),
    db.lead.groupBy({ by: ["source"], where: { userId: user.id }, _count: true }),
    db.lead.findMany({ where: { userId: user.id, status: { notIn: ["CLOSED"] } }, select: { score: true } }),
  ]);

  const href = (patch: Partial<SP>) => {
    const next = { ...sp, ...patch };
    const p = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/leads${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        accent="text-sky-300"
        title="All Leads"
        subtitle="Everyone in one place, color-coded by how ready they are."
        actions={
          <Link href="/leads/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Add a lead
          </Link>
        }
      />

      {/* Temperature filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={href({ tier: undefined })}
          className={clsx("chip px-3.5 py-1.5 text-[13px]", !tier ? "bg-white text-ink-950 ring-white" : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10")}
        >
          Everyone <span className="opacity-60">{counts.length}</span>
        </Link>
        {TIERS.map((t, i) => {
          const n = counts.filter((c) => c.score >= t.min && (i === 0 || c.score < TIERS[i - 1].min)).length;
          const active = tier?.key === t.key;
          return (
            <Link
              key={t.key}
              href={href({ tier: active ? undefined : t.key })}
              className={clsx("chip px-3.5 py-1.5 text-[13px] transition", t.chip, active ? "ring-2 brightness-125" : "opacity-80 hover:opacity-100")}
            >
              <span className={clsx("h-2 w-2 rounded-full", t.dot)} /> {t.label} <span className="opacity-60">{n}</span>
            </Link>
          );
        })}
      </div>

      {/* Search + secondary filters */}
      <form className="mb-6 flex flex-col gap-2 sm:flex-row" action="/leads">
        {tier && <input type="hidden" name="tier" value={tier.key} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input name="q" defaultValue={q} placeholder="Search name, email, phone, address, city…" className="input pl-10" />
        </div>
        <select name="status" defaultValue={status ?? ""} className="input sm:w-48">
          <option value="">Any stage</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="input sm:w-44">
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s.source} value={s.source}>{s.source} ({s._count})</option>
          ))}
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""} className="input sm:w-40">
          <option value="">Hottest first</option>
          <option value="new">Newest first</option>
        </select>
        <button className="btn-secondary">Apply</button>
      </form>

      {leads.length ? (
        <div className="space-y-2.5">
          {leads.map((l) => <LeadRow key={l.id} lead={l} next={l.touches[0]} />)}
        </div>
      ) : (
        <EmptyState icon={Users} title="No leads match" tone="cyan">
          Try a different filter, or <Link href="/leads" className="text-cyan-300 underline">clear all filters</Link>.
        </EmptyState>
      )}
    </div>
  );
}
