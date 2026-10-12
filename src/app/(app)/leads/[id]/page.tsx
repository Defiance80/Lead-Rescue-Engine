import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  CircleDashed,
  Compass,
  Hand,
  Mail,
  MapPin,
  MessageSquare,
  MessagesSquare,
  PauseCircle,
  Phone,
  PlayCircle,
  Quote,
  Send,
  Sparkles,
  Timer,
  UserRound,
  XCircle,
} from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { explainSignals } from "@/lib/intake";
import { nextMoveFor } from "@/lib/queries";
import { ago, duration, priceRange } from "@/lib/time";
import { tierFor } from "@/lib/tiers";
import { effectivePriority, PRIORITIES, priorityMeta, temperatureFor, tempMeta } from "@/lib/temperature";
import { Avatar, ScoreRing, STATUS_META, StatusChip, TierChip } from "@/components/ui";
import { ActionButton, CopyButton, SendTouchButton, SpeedClock } from "@/components/client";
import {
  addNoteAction,
  deleteLeadAction,
  doNotContactAction,
  handledAction,
  logContactAction,
  markTouchAction,
  recordEventAction,
  setAutopilotAction,
  setPriorityAction,
  setStatusAction,
  snoozeAction,
  updateLeadAction,
} from "../../../actions";

export const metadata: Metadata = { title: "Lead" };

const TYPE_LABEL = { BUYER: "Buyer", SELLER: "Seller", BOTH: "Buying & selling", UNKNOWN: "Not sure yet" };

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; merged?: string; rescued?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const lead = await db.lead.findFirst({
    where: { id, userId: user.id },
    include: {
      touches: { orderBy: [{ dueAt: "asc" }, { channel: "asc" }] },
      activities: { orderBy: { createdAt: "desc" }, take: 60 },
    },
  });
  if (!lead) notFound();

  const t = tierFor(lead.score);
  const pending = lead.touches.filter((x) => x.status === "PENDING");
  const move = nextMoveFor({ ...lead, touches: pending });
  const signals = explainSignals(lead.signals);
  const budget = priceRange(lead.priceMin, lead.priceMax);
  const now = new Date();
  const smsHref = (body: string) => (lead.phone ? `sms:${lead.phone}?&body=${encodeURIComponent(body)}` : "");
  const mailHref = (subject: string | null, body: string) =>
    lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent(subject ?? "")}&body=${encodeURIComponent(body)}` : "";
  const closed = lead.status === "CLIENT" || lead.status === "CLOSED" || lead.doNotContact;

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All leads
      </Link>

      {sp.new && <Banner tone="emerald" icon={Sparkles}>Lead added. A personal follow-up plan is ready below.</Banner>}
      {sp.merged && <Banner tone="cyan" icon={MessagesSquare}>Already in your pipeline — we merged the new info into their record instead of making a duplicate.</Banner>}
      {sp.rescued && <Banner tone="emerald" icon={CheckCircle2}>Rescued! This lead is back on track with a full follow-up plan.</Banner>}

      {/* Header */}
      <section data-tour="lead-header" className="card relative overflow-hidden">
        <div className={clsx("absolute inset-x-0 top-0 h-1", t.bar)} />
        <div className="card-pad flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Avatar first={lead.firstName} last={lead.lastName} size="lg" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {lead.firstName} {lead.lastName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TierChip score={lead.score} />
                <span className={clsx("chip", tempMeta(temperatureFor(lead.score)).chip)}>{tempMeta(temperatureFor(lead.score)).label}</span>
                <span className={clsx("chip", priorityMeta(effectivePriority(lead)).chip)}>{priorityMeta(effectivePriority(lead)).label} priority</span>
                <StatusChip status={lead.status} />
                <SpeedClock since={lead.createdAt.toISOString()} respondedAt={lead.firstResponseAt?.toISOString() ?? null} />
                {lead.autopilot ? (
                  <span className="chip bg-violet-400/10 text-violet-300 ring-violet-400/30"><Send className="h-3 w-3" /> Autopilot on</span>
                ) : (
                  <span className="chip bg-white/5 text-slate-400 ring-white/10"><PauseCircle className="h-3 w-3" /> Autopilot off</span>
                )}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {[lead.phone, lead.email].filter(Boolean).join(" · ") || "No contact info"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="btn-primary"><Phone className="h-4 w-4" /> Call</a>
            )}
            {lead.phone && lead.smsConsent && (
              <a href={`sms:${lead.phone}`} className="btn-secondary"><MessageSquare className="h-4 w-4" /> Text</a>
            )}
            {lead.email && !lead.emailOptOut && (
              <a href={`mailto:${lead.email}`} className="btn-secondary"><Mail className="h-4 w-4" /> Email</a>
            )}
            <div className="hidden pl-2 sm:block"><ScoreRing score={lead.score} size={64} /></div>
          </div>
        </div>
      </section>

      {lead.needsAgent && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-400/40 bg-gradient-to-r from-rose-500/20 to-fuchsia-500/10 p-4 sm:flex-row sm:items-center">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500 text-white pulse-ring"><Hand className="h-5 w-5" /></span>
          <div className="flex-1">
            <div className="font-semibold text-white">{lead.firstName} would love to hear from you</div>
            <div className="text-sm text-rose-100/80">{lead.needsAgentReason ?? "Strong signals"}. Automated messages are paused so your personal touch lands.</div>
          </div>
          <ActionButton action={handledAction.bind(null, lead.id)} className="btn-secondary btn-sm">
            <CheckCircle2 className="h-4 w-4" /> I&apos;ve handled it
          </ActionButton>
        </div>
      )}
      {lead.reviewFlag && (
        <Banner tone="amber" icon={AlertTriangle}>
          <b>Personal reply recommended.</b> {lead.reviewFlag}. Keep the reply focused on homes and features — not people or neighborhoods&apos; demographics.
        </Banner>
      )}
      {lead.doNotContact && <Banner tone="slate" icon={XCircle}>Do not contact — all messaging is stopped for this person.</Banner>}

      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          {/* At a glance — the 7 questions */}
          <section data-tour="at-a-glance" className="card card-pad">
            <h2 className="mb-4 font-display text-base font-bold text-white">At a glance</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Glance icon={UserRound} tone="text-sky-300 bg-sky-400/10" q="Who" a={`${lead.firstName} ${lead.lastName ?? ""}`.trim()} sub={TYPE_LABEL[lead.leadType]} />
              <Glance icon={Compass} tone="text-cyan-300 bg-cyan-400/10" q="Came from" a={lead.source} sub={[lead.campaign, lead.referral && `Referred by ${lead.referral}`].filter(Boolean).join(" · ") || ago(lead.createdAt)} />
              <Glance icon={MapPin} tone="text-ember-300 bg-ember-500/10" q="Interested in" a={lead.property ?? lead.city ?? "Not specified"} sub={[lead.property && lead.city, lead.mlsNumber && `MLS ${lead.mlsNumber}`, budget, lead.timeline].filter(Boolean).join(" · ") || undefined} />
              <Glance
                icon={Timer}
                tone="text-emerald-300 bg-emerald-400/10"
                q="First reply"
                a={lead.firstResponseAt ? duration(lead.firstResponseAt.getTime() - lead.createdAt.getTime()) : "Not yet"}
                sub={lead.firstResponseAt ? `Last contact ${ago(lead.lastContactAt)}` : `Arrived ${ago(lead.createdAt)}`}
                warn={!lead.firstResponseAt}
              />
              <Glance icon={MessagesSquare} tone="text-violet-300 bg-violet-400/10" q="Engaged?" a={lead.lastEngagementAt ? "Yes" : "Not yet"} sub={lead.lastEngagementAt ? `Last activity ${ago(lead.lastEngagementAt)}` : "Autopilot is working on it"} />
              <Glance icon={Sparkles} tone="text-amber-300 bg-amber-400/10" q="Next step" a={closed ? "Nothing needed" : move.headline} sub={closed ? undefined : move.why} />
            </div>
            {lead.inquiry && (
              <blockquote className="mt-4 flex gap-3 rounded-xl border-l-2 border-ember-400 bg-white/[0.03] p-4 text-[15px] italic leading-relaxed text-slate-200">
                <Quote className="h-4 w-4 shrink-0 text-ember-300" />
                {lead.inquiry}
              </blockquote>
            )}
          </section>

          {/* Follow-up plan */}
          <section data-tour="follow-up-plan" className="card card-pad">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-white">Follow-up plan</h2>
              <span className="text-xs text-slate-500">
                {lead.touches.filter((x) => x.status === "DONE").length} of {lead.touches.length} steps done
              </span>
            </div>
            <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-white/10">
              {lead.touches.map((tc) => {
                const due = tc.status === "PENDING" && tc.dueAt <= now;
                const Icon = tc.channel === "SMS" ? MessageSquare : tc.channel === "EMAIL" ? Mail : CalendarCheck;
                const href = tc.channel === "SMS" ? smsHref(tc.message) : tc.channel === "EMAIL" ? mailHref(tc.subject, tc.message) : "";
                return (
                  <li key={tc.id} className="relative flex gap-4">
                    <span
                      className={clsx(
                        "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ring-1 ring-inset",
                        tc.status === "DONE" && "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
                        tc.status === "SKIPPED" && "bg-ink-800 text-slate-600 ring-white/5",
                        tc.status === "PENDING" && (due ? "bg-amber-400 text-ink-950 ring-amber-300" : "bg-ink-800 text-slate-300 ring-white/10"),
                      )}
                    >
                      {tc.status === "DONE" ? <CheckCircle2 className="h-4 w-4" /> : `D${tc.day}`}
                    </span>
                    <details className={clsx("group flex-1 rounded-xl border p-3", due ? "border-amber-300/30 bg-amber-400/[0.06]" : "border-white/[0.06] bg-white/[0.02]", tc.status === "SKIPPED" && "opacity-50")} open={due}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-400" />
                        <span className={clsx("font-semibold", tc.status === "SKIPPED" ? "text-slate-500 line-through" : "text-slate-100")}>{tc.label}</span>
                        <span className="text-xs text-slate-500">
                          {tc.status === "DONE"
                            ? `Sent ${ago(tc.completedAt)}${tc.completedBy === "autopilot" ? " by autopilot" : ""}`
                            : tc.status === "SKIPPED"
                              ? "Skipped"
                              : due
                                ? "Ready now"
                                : `Scheduled ${ago(tc.dueAt)}`}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        {tc.subject && <div className="text-xs text-slate-400">Subject: <span className="text-slate-200">{tc.subject}</span></div>}
                        <p className="whitespace-pre-line rounded-lg bg-ink-950/60 p-3 text-sm leading-relaxed text-slate-300">{tc.message}</p>
                        {tc.status === "PENDING" && !closed && (
                          <div className="flex flex-wrap gap-2">
                            {href && <SendTouchButton href={href} action={markTouchAction.bind(null, tc.id, false)}>{tc.channel === "SMS" ? "Open text & mark sent" : "Open email & mark sent"}</SendTouchButton>}
                            {tc.channel !== "TASK" && <CopyButton text={tc.message} label="Copy message" className="btn-secondary btn-sm" />}
                            <ActionButton action={markTouchAction.bind(null, tc.id, false)} className="btn-ghost btn-sm">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {tc.channel === "TASK" ? "Do it now" : "Already sent"}
                            </ActionButton>
                            <ActionButton action={markTouchAction.bind(null, tc.id, true)} className="btn-ghost btn-sm">
                              <CircleDashed className="h-3.5 w-3.5" /> Skip
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Timeline */}
          <section className="card card-pad">
            <h2 className="mb-4 font-display text-base font-bold text-white">Timeline</h2>
            <form action={addNoteAction} className="mb-5 flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="kind" value="note" />
              <input name="body" placeholder="Add a quick note…" className="input" />
              <button className="btn-secondary">Save</button>
            </form>
            <ul className="space-y-4">
              {lead.activities.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ACT_DOT[a.kind] ?? "bg-slate-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-100">{a.title}</span>
                      {a.scoreDelta ? (
                        <span className={clsx("text-xs font-bold", a.scoreDelta > 0 ? "text-emerald-300" : "text-rose-300")}>
                          {a.scoreDelta > 0 ? "+" : ""}{a.scoreDelta}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-500">{ago(a.createdAt)} · {a.actor}</span>
                    </div>
                    {a.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-slate-400">{a.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <section data-tour="log-it" className="card card-pad">
            <h2 className="mb-1 font-display text-base font-bold text-white">Log what happened</h2>
            <p className="mb-4 text-xs text-slate-500">One tap keeps the record straight.</p>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton action={logContactAction.bind(null, lead.id, "call", undefined)} className="btn-secondary"><Phone className="h-4 w-4 text-ember-300" /> Called</ActionButton>
              <ActionButton action={logContactAction.bind(null, lead.id, "sms", undefined)} className="btn-secondary"><MessageSquare className="h-4 w-4 text-cyan-300" /> Texted</ActionButton>
              <ActionButton action={logContactAction.bind(null, lead.id, "email", undefined)} className="btn-secondary"><Mail className="h-4 w-4 text-sky-300" /> Emailed</ActionButton>
              <ActionButton action={recordEventAction.bind(null, lead.id, "reply_text", undefined)} className="btn-secondary"><MessagesSquare className="h-4 w-4 text-emerald-300" /> They replied</ActionButton>
              <ActionButton action={recordEventAction.bind(null, lead.id, "showing_request", undefined)} className="btn-secondary"><BellRing className="h-4 w-4 text-amber-300" /> Wants a tour</ActionButton>
              <ActionButton action={recordEventAction.bind(null, lead.id, "calendar_booked", undefined)} className="btn-secondary"><CalendarCheck className="h-4 w-4 text-violet-300" /> Booked</ActionButton>
            </div>
            <div className="mt-3 flex gap-2">
              <ActionButton action={snoozeAction.bind(null, lead.id, 1)} className="btn-ghost btn-sm flex-1">Set aside 1 day</ActionButton>
              <ActionButton action={snoozeAction.bind(null, lead.id, 7)} className="btn-ghost btn-sm flex-1">1 week</ActionButton>
            </div>
          </section>

          <section data-tour="autopilot-card" className="card card-pad">
            <div className="flex items-start gap-3">
              <span className={clsx("grid h-10 w-10 place-items-center rounded-xl", lead.autopilot ? "bg-violet-400/15 text-violet-300" : "bg-white/5 text-slate-400")}>
                <Send className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2 className="font-display text-base font-bold text-white">Autopilot {lead.autopilot ? "is on" : "is off"}</h2>
                <p className="text-sm text-slate-400">
                  {lead.autopilot
                    ? `Following up automatically. ${pending.filter((p) => p.channel !== "TASK").length} messages left in the plan.`
                    : lead.autopilotNote ?? "Paused."}
                </p>
              </div>
            </div>
            {!closed && (
              <div className="mt-4">
                {lead.autopilot ? (
                  <ActionButton action={setAutopilotAction.bind(null, lead.id, false)} className="btn-secondary w-full"><PauseCircle className="h-4 w-4" /> Pause autopilot</ActionButton>
                ) : (
                  <ActionButton action={setAutopilotAction.bind(null, lead.id, true)} className="btn-secondary w-full"><PlayCircle className="h-4 w-4 text-violet-300" /> Resume autopilot</ActionButton>
                )}
              </div>
            )}
          </section>

          <section data-tour="why-score" className="card card-pad">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white">Why {lead.score}?</h2>
              <TierChip score={lead.score} />
            </div>
            <ul className="space-y-1.5">
              {signals.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{s.label}</span>
                  <span className={clsx("font-display font-bold", s.points > 0 ? "text-emerald-300" : "text-rose-300")}>
                    {s.points > 0 ? "+" : ""}{s.points}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{t.hint}.</p>
          </section>

          <section data-tour="priority" className="card card-pad">
            <h2 className="mb-1 font-display text-base font-bold text-white">Priority</h2>
            <p className="mb-3 text-xs text-slate-500">
              {lead.priority ? "Set by you." : `Automatic — currently ${priorityMeta(effectivePriority(lead)).label.toLowerCase()}, based on score and activity.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                action={setPriorityAction.bind(null, lead.id, null)}
                className={clsx("chip cursor-pointer px-3 py-1.5", !lead.priority ? "bg-white text-ink-950 ring-white" : "bg-white/[0.03] text-slate-300 ring-white/10 hover:text-white")}
              >
                Automatic
              </ActionButton>
              {PRIORITIES.map((p) => (
                <ActionButton
                  key={p.value}
                  action={setPriorityAction.bind(null, lead.id, p.value)}
                  className={clsx("chip cursor-pointer px-3 py-1.5", lead.priority === p.value ? p.chip + " ring-2" : "bg-white/[0.03] text-slate-300 ring-white/10 hover:text-white")}
                >
                  {p.label}
                </ActionButton>
              ))}
            </div>
          </section>

          <section data-tour="stage" className="card card-pad">
            <h2 className="mb-3 font-display text-base font-bold text-white">Stage</h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => (
                <ActionButton
                  key={s}
                  action={setStatusAction.bind(null, lead.id, s)}
                  className={clsx("chip cursor-pointer px-3 py-1.5", s === lead.status ? STATUS_META[s].cls + " ring-2" : "bg-white/[0.03] text-slate-400 ring-white/10 hover:text-white")}
                >
                  {STATUS_META[s].label}
                </ActionButton>
              ))}
            </div>
          </section>

          <details className="card card-pad group">
            <summary className="cursor-pointer list-none font-display text-base font-bold text-white">
              Edit details <span className="text-sm font-normal text-slate-500 group-open:hidden">— fix a typo or add what you learned</span>
            </summary>
            <form action={updateLeadAction} className="mt-4 grid gap-3">
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid grid-cols-2 gap-3">
                <Input name="firstName" label="First" value={lead.firstName} />
                <Input name="lastName" label="Last" value={lead.lastName} />
              </div>
              <Input name="phone" label="Phone" value={lead.phone} />
              <Input name="email" label="Email" value={lead.email} />
              <Input name="property" label="Property" value={lead.property} />
              <Input name="city" label="Area / city" value={lead.city} />
              <div className="grid grid-cols-2 gap-3">
                <Input name="priceMin" label="Budget min" value={lead.priceMin?.toString()} />
                <Input name="priceMax" label="Budget max" value={lead.priceMax?.toString()} />
              </div>
              <Input name="timeline" label="Timeline" value={lead.timeline} />
              <Input name="financing" label="Financing" value={lead.financing} />
              <div>
                <label className="label">Looking to</label>
                <select name="leadType" defaultValue={lead.leadType} className="input">
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button className="btn-primary">Save details</button>
            </form>
          </details>

          <section className="rounded-2xl border border-white/[0.06] p-5">
            <h2 className="eyebrow mb-3">Compliance</h2>
            <ul className="mb-4 space-y-1 text-sm text-slate-400">
              <li>Texts: {lead.smsConsent ? <span className="text-emerald-300">opted in</span> : <span className="text-rose-300">no consent</span>}</li>
              <li>Email: {lead.emailOptOut ? <span className="text-rose-300">unsubscribed</span> : <span className="text-emerald-300">subscribed</span>}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              {!lead.doNotContact && (
                <ActionButton action={doNotContactAction.bind(null, lead.id)} confirm="Stop all messages to this person?" className="btn-ghost btn-sm text-amber-300">
                  Do not contact
                </ActionButton>
              )}
              <ActionButton action={deleteLeadAction.bind(null, lead.id)} confirm="Delete this lead and its history permanently?" className="btn-ghost btn-sm text-rose-300">
                Delete lead
              </ActionButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const ACT_DOT: Record<string, string> = {
  created: "bg-fuchsia-400",
  merged: "bg-cyan-300",
  sms: "bg-cyan-400",
  email: "bg-sky-400",
  call: "bg-ember-400",
  note: "bg-slate-400",
  reply: "bg-emerald-400",
  event: "bg-amber-300",
  status: "bg-violet-400",
  autopilot: "bg-violet-300",
  score: "bg-slate-500",
};

function Glance({
  icon: Icon,
  tone,
  q,
  a,
  sub,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  q: string;
  a: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={clsx("flex gap-3 rounded-xl border p-3.5", warn ? "border-amber-300/30 bg-amber-400/[0.05]" : "border-white/[0.06] bg-white/[0.02]")}>
      <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="eyebrow text-[10px]">{q}</div>
        <div className="line-clamp-2 font-semibold text-white">{a}</div>
        {sub && <div className="line-clamp-2 text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

function Input({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ""} className="input" />
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "emerald" | "cyan" | "amber" | "slate";
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const t = {
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 [&_svg]:text-emerald-300",
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100 [&_svg]:text-cyan-300",
    amber: "border-amber-300/30 bg-amber-400/10 text-amber-100 [&_svg]:text-amber-300",
    slate: "border-white/10 bg-white/5 text-slate-300",
  }[tone];
  return (
    <div className={clsx("flex items-start gap-3 rounded-2xl border p-4 text-sm", t)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
