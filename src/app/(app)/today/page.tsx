import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowRight,
  Crosshair,
  Database,
  Flame,
  Inbox,
  LifeBuoy,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import { requireUser, agentFirstName } from "@/lib/session";
import { dashboardStats, nextMoveFor, priorityLane, safetyNetCount, upcomingTouches } from "@/lib/queries";
import { runMaintenance } from "@/lib/engagement";
import { ago, duration, greeting } from "@/lib/time";
import { db } from "@/lib/db";
import { Avatar, PageHeader, SectionTitle, StatTile, TierChip } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";
import { SpeedClock } from "@/components/client";
import { loadSampleAction } from "../../actions";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  await runMaintenance(user.id);

  const [totalLeads, lane, stats, safety, upcoming] = await Promise.all([
    db.lead.count({ where: { userId: user.id } }),
    priorityLane(user.id, 6),
    dashboardStats(user.id, user.timezone),
    safetyNetCount(user.id),
    upcomingTouches(user.id, 5),
  ]);
  const name = agentFirstName(user);

  if (totalLeads === 0) return <Welcome name={name} />;

  const move = lane[0] ? nextMoveFor(lane[0]) : null;
  const waitingHello = lane.filter((l) => !l.firstResponseAt).length;
  const hotCount = stats.tiers[0].count + stats.tiers[1].count;
  const cleared = stats.doneToday;
  const total = stats.doneToday + stats.dueToday;
  const pct = total === 0 ? 100 : Math.round((cleared / total) * 100);

  const summary =
    stats.dueToday === 0 && waitingHello === 0
      ? "Everyone has heard from you. Beautiful — the engine is keeping them warm."
      : [
          waitingHello > 0 && `${waitingHello} ${waitingHello === 1 ? "person is" : "people are"} waiting on a first hello`,
          stats.dueToday > 0 && `${stats.dueToday} follow-up${stats.dueToday === 1 ? " is" : "s are"} ready to go`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: user.timezone })}
        title={`${greeting(user.timezone)}, ${name}`}
        subtitle={summary}
        actions={
          <Link href="/focus" className="btn-primary">
            <Crosshair className="h-4 w-4" /> Start Focus Mode
          </Link>
        }
      />

      {/* Next move + momentum */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {move ? (
          <div data-tour="next-move" className="rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-ember-500/90 via-rose-500/85 to-fuchsia-600/80 p-[1px]">
            <div className="relative h-full rounded-[23px] bg-ink-900/85 p-6 sm:p-7">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-ember-500/25 blur-3xl" />
              <div className="eyebrow flex items-center gap-2 text-ember-300">
                <Sparkles className="h-3.5 w-3.5" /> Your next best move
              </div>
              <div className="mt-4 flex items-start gap-4">
                <Avatar first={move.lead.firstName} last={move.lead.lastName} size="lg" />
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-bold leading-tight text-white sm:text-[28px]">{move.headline}</h2>
                  <p className="mt-1.5 text-slate-300">{move.why}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TierChip score={move.lead.score} />
                    <SpeedClock since={move.lead.createdAt.toISOString()} respondedAt={move.lead.firstResponseAt?.toISOString() ?? null} />
                    {(move.lead.property || move.lead.city) && (
                      <span className="chip bg-white/5 text-slate-300 ring-white/10">{move.lead.property ?? move.lead.city}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={`/leads/${move.lead.id}`} className="btn-primary">
                  {move.action} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/focus" className="btn-secondary">
                  <Crosshair className="h-4 w-4" /> Work the whole list
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="card card-pad flex items-center gap-5">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-white">All clear right now</h2>
              <p className="text-slate-400">Nobody needs you this minute. Autopilot is handling follow-ups.</p>
            </div>
          </div>
        )}

        <div data-tour="momentum" className="card card-pad flex items-center gap-6">
          <Momentum pct={pct} />
          <div>
            <div className="eyebrow text-emerald-300">Today&apos;s momentum</div>
            <div className="mt-1 font-display text-2xl font-bold text-white">
              {cleared} <span className="text-slate-500">/ {total}</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {total === 0
                ? "Nothing due yet today."
                : pct === 100
                  ? "Every follow-up handled. That's how deals happen."
                  : pct >= 50
                    ? "Over halfway — keep rolling."
                    : "Each one cleared keeps a lead warm."}
            </p>
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div data-tour="stats" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="New today" value={stats.newToday} hint={`${stats.newWeek} this week`} icon={Inbox} tone="ember" href="/leads?sort=new" />
        <StatTile label="First reply speed" value={duration(stats.medianResponse)} hint="Typical, last 30 days" icon={Timer} tone="cyan" href="/scoreboard" />
        <StatTile label="Ready & Hot" value={hotCount} hint="Strong buying signals" icon={Flame} tone="rose" href="/priority" />
        <StatTile label="In the Safety Net" value={safety} hint={safety ? "Worth a quick look" : "Nothing slipping"} icon={ShieldCheck} tone="amber" href="/safety-net" />
        <StatTile label="Rescued this week" value={stats.rescued} hint="Re-engaged by follow-up" icon={Trophy} tone="emerald" href="/scoreboard" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Priority lane */}
        <section data-tour="priority-lane">
          <SectionTitle
            dot="bg-rose-400"
            right={
              <Link href="/priority" className="text-sm font-semibold text-ember-300 hover:text-ember-200">
                See all →
              </Link>
            }
          >
            Priority Lane
          </SectionTitle>
          <div className="space-y-2.5">
            {lane.length ? (
              lane.slice(0, 5).map((l) => <LeadRow key={l.id} lead={l} next={l.touches[0]} reason={l.needsAgentReason ?? undefined} />)
            ) : (
              <div className="card card-pad text-sm text-slate-400">No one in the lane. Enjoy the calm.</div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          {/* Temperature */}
          <section data-tour="temperature" className="card card-pad">
            <SectionTitle>Pipeline temperature</SectionTitle>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-white/5">
              {stats.tiers.map((t) =>
                t.count ? (
                  <div key={t.key} className={clsx("h-full", t.bar)} style={{ width: `${(t.count / Math.max(1, stats.activeTotal)) * 100}%` }} />
                ) : null,
              )}
            </div>
            <ul className="space-y-1">
              {stats.tiers.map((t) => (
                <li key={t.key}>
                  <Link href={`/leads?tier=${t.key}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]">
                    <span className={clsx("h-2.5 w-2.5 rounded-full", t.dot)} />
                    <span className="flex-1 font-medium text-slate-200">{t.label}</span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{t.hint}</span>
                    <span className={clsx("w-6 text-right font-display font-bold", t.text)}>{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Autopilot */}
          <section className="card card-pad">
            <SectionTitle
              dot="bg-violet-400"
              right={<Link href="/autopilot" className="text-sm font-semibold text-violet-300 hover:text-violet-200">Plan →</Link>}
            >
              Autopilot is handling
            </SectionTitle>
            {upcoming.length ? (
              <ul className="space-y-2.5">
                {upcoming.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-400/10 text-[11px] font-bold text-violet-300">D{t.day}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/leads/${t.leadId}`} className="font-semibold text-slate-100 hover:underline">{t.lead.firstName} {t.lead.lastName}</Link>
                      <div className="truncate text-xs text-slate-500">{t.label}</div>
                    </div>
                    <span className="text-xs text-slate-400">{ago(t.dueAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No upcoming automated follow-ups.</p>
            )}
          </section>

          {/* Sources */}
          {stats.sources.length > 0 && (
            <section className="card card-pad">
              <SectionTitle>Where leads come from <span className="text-xs font-normal text-slate-500">· 30 days</span></SectionTitle>
              <ul className="space-y-2.5">
                {stats.sources.slice(0, 6).map((s) => (
                  <li key={s.source} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span className="text-slate-300">{s.source}</span>
                      <span className="font-semibold text-white">{s.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${(s.count / stats.sources[0].count) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Momentum({ pct }: { pct: number }) {
  const size = 96;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="mom" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} stroke="rgb(255 255 255 / 0.07)" strokeWidth="9" fill="none" />
        <circle cx="48" cy="48" r={r} stroke="url(#mom)" strokeWidth="9" strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold text-white">{pct}%</span>
    </div>
  );
}

function Welcome({ name }: { name: string }) {
  const steps = [
    {
      icon: Database,
      tone: "bg-ember-500/12 text-ember-300",
      title: "See it in action",
      text: "Load a dozen realistic sample leads so you can click around. Clear them anytime.",
      cta: (
        <form action={loadSampleAction}>
          <button className="btn-primary w-full">Load sample leads</button>
        </form>
      ),
    },
    {
      icon: UserRound,
      tone: "bg-cyan-400/12 text-cyan-300",
      title: "Make it sound like you",
      text: "Set the name you sign messages with and the hours you never want texts going out.",
      cta: <Link href="/settings" className="btn-secondary w-full">Set my preferences</Link>,
    },
    {
      icon: PlugZap,
      tone: "bg-violet-400/12 text-violet-300",
      title: "Connect lead sources",
      text: "Point n8n, Zillow, Facebook, or your website form at your private intake link.",
      cta: <Link href="/settings#connections" className="btn-secondary w-full">Get my intake link</Link>,
    },
  ];
  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900 p-8 sm:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ember-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ember-500/15 text-ember-300">
            <LifeBuoy className="h-7 w-7" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome aboard, {name}.
          </h1>
          <p className="mt-3 text-lg text-slate-300">
            From here on, every lead gets a fast, personal hello and steady follow-up — and you get a
            clear signal when someone is ready for you. Three quick steps:
          </p>
        </div>
      </div>
      <div data-tour="welcome-steps" className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card card-pad flex flex-col">
            <div className="flex items-center gap-3">
              <span className={clsx("grid h-10 w-10 place-items-center rounded-xl", s.tone)}>
                <s.icon className="h-5 w-5" />
              </span>
              <span className="eyebrow">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-white">{s.title}</h3>
            <p className="mt-1 flex-1 text-sm text-slate-400">{s.text}</p>
            <div className="mt-5">{s.cta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
