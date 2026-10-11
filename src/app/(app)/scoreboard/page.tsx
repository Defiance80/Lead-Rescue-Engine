import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { CalendarCheck, Handshake, HeartHandshake, Inbox, LifeBuoy, MessagesSquare, PhoneOutgoing, Timer, Zap } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { rescuedCount } from "@/lib/queries";
import { duration } from "@/lib/time";
import { PageHeader, StatTile } from "@/components/ui";

export const metadata: Metadata = { title: "Scoreboard" };

const RANGES = [7, 30, 90] as const;

export default async function ScoreboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const since = new Date(Date.now() - days * 86400000);

  const [leads, rescued] = await Promise.all([
    db.lead.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      select: {
        id: true,
        source: true,
        status: true,
        createdAt: true,
        firstResponseAt: true,
        lastEngagementAt: true,
        signals: true,
        activities: { where: { actor: "agent", kind: { in: ["call", "sms", "email"] } }, select: { id: true }, take: 1 },
      },
    }),
    rescuedCount(user.id, since),
  ]);

  const n = leads.length;
  const pct = (x: number) => (n ? `${Math.round((x / n) * 100)}%` : "—");
  const responded = leads.filter((l) => l.firstResponseAt);
  const times = responded.map((l) => l.firstResponseAt!.getTime() - l.createdAt.getTime()).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  const under5 = times.filter((t) => t <= 5 * 60000).length;
  const engaged = leads.filter((l) => l.lastEngagementAt).length;
  const isAppt = (l: (typeof leads)[number]) =>
    ["APPOINTMENT", "CLIENT"].includes(l.status) || l.signals.includes("calendar_booked") || l.signals.includes("showing_requested");
  const appts = leads.filter(isAppt).length;
  const clients = leads.filter((l) => l.status === "CLIENT").length;
  const personal = leads.filter((l) => l.activities.length > 0).length;

  const bySource = Object.values(
    leads.reduce<Record<string, { source: string; total: number; responded: number; engaged: number; appts: number; clients: number }>>((acc, l) => {
      const s = (acc[l.source] ??= { source: l.source, total: 0, responded: 0, engaged: 0, appts: 0, clients: 0 });
      s.total++;
      if (l.firstResponseAt) s.responded++;
      if (l.lastEngagementAt) s.engaged++;
      if (isAppt(l)) s.appts++;
      if (l.status === "CLIENT") s.clients++;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Grow"
        accent="text-emerald-300"
        title="Scoreboard"
        subtitle="Proof the system is working — and where your best leads really come from."
        actions={
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/scoreboard?days=${r}`}
                className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", r === days ? "bg-white text-ink-950" : "text-slate-400 hover:text-white")}
              >
                {r}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Leads captured" value={n} icon={Inbox} tone="ember" hint={`Last ${days} days`} />
        <StatTile label="Typical first reply" value={duration(median)} icon={Timer} tone="cyan" hint="Median time to first hello" />
        <StatTile label="Answered in 5 min" value={times.length ? `${Math.round((under5 / times.length) * 100)}%` : "—"} icon={Zap} tone="amber" hint="The window that wins deals" />
        <StatTile label="Rescued" value={rescued} icon={LifeBuoy} tone="emerald" hint="Re-engaged after going quiet" />
      </div>

      {/* Funnel */}
      <section className="card card-pad">
        <h2 className="mb-5 font-display text-base font-bold text-white">From first hello to client</h2>
        <div className="space-y-3">
          {[
            { label: "Captured", v: n, icon: Inbox, bar: "from-ember-500 to-rose-500" },
            { label: "Reached out", v: responded.length, icon: PhoneOutgoing, bar: "from-amber-400 to-orange-500" },
            { label: "Engaged back", v: engaged, icon: MessagesSquare, bar: "from-cyan-400 to-sky-500" },
            { label: "Appointment / tour", v: appts, icon: CalendarCheck, bar: "from-violet-400 to-fuchsia-500" },
            { label: "Became a client", v: clients, icon: Handshake, bar: "from-emerald-400 to-lime-400" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-4">
              <div className="flex w-44 shrink-0 items-center gap-2 text-sm text-slate-300">
                <f.icon className="h-4 w-4 text-slate-500" /> {f.label}
              </div>
              <div className="h-8 flex-1 overflow-hidden rounded-lg bg-white/[0.04]">
                <div
                  className={clsx("flex h-full items-center rounded-lg bg-gradient-to-r px-3 text-xs font-bold text-white", f.bar)}
                  style={{ width: `${n ? Math.max(4, (f.v / n) * 100) : 4}%` }}
                >
                  {f.v}
                </div>
              </div>
              <div className="w-12 text-right font-display text-sm font-bold text-white">{pct(f.v)}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.03] p-3 text-sm text-slate-300">
          <HeartHandshake className="h-4 w-4 text-rose-300" />
          <span>
            <b className="text-white">{pct(personal)}</b> of leads got a personal touch from you (a call, text, or email you logged), on top of autopilot.
          </span>
        </div>
      </section>

      {/* Sources */}
      <section className="card overflow-hidden">
        <div className="card-pad pb-3">
          <h2 className="font-display text-base font-bold text-white">Lead sources, ranked</h2>
          <p className="text-sm text-slate-500">Spend more where leads turn into conversations.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold">Source</th>
                <th className="px-3 py-3 text-right font-semibold">Leads</th>
                <th className="px-3 py-3 text-right font-semibold">Reached</th>
                <th className="px-3 py-3 text-right font-semibold">Engaged</th>
                <th className="px-3 py-3 text-right font-semibold">Appts</th>
                <th className="px-6 py-3 text-right font-semibold">Clients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bySource.map((s) => (
                <tr key={s.source} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3 font-semibold text-slate-100">
                    <Link href={`/leads?source=${encodeURIComponent(s.source)}`} className="hover:underline">{s.source}</Link>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300">{s.total}</td>
                  <td className="px-3 py-3 text-right text-slate-300">{Math.round((s.responded / s.total) * 100)}%</td>
                  <td className="px-3 py-3 text-right">
                    <span className={clsx("font-semibold", s.engaged / s.total >= 0.3 ? "text-emerald-300" : "text-slate-300")}>
                      {Math.round((s.engaged / s.total) * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300">{s.appts}</td>
                  <td className="px-6 py-3 text-right font-semibold text-white">{s.clients}</td>
                </tr>
              ))}
              {bySource.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No leads in this window yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
