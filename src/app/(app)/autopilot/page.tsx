import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Ban, CalendarCheck, Hand, Mail, MessageSquare, Moon, PlugZap, Send, Zap } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ACTIVE } from "@/lib/queries";
import { ago, inQuietHours } from "@/lib/time";
import { PageHeader, SectionTitle } from "@/components/ui";
import { ActionButton, SendTouchButton } from "@/components/client";
import { markTouchAction } from "../../actions";

export const metadata: Metadata = { title: "Autopilot" };

const STEPS = [
  { day: 0, title: "Instant hello", detail: "Text + email that mention exactly what they asked about", icon: Zap },
  { day: 1, title: "Gentle check-in", detail: "Makes sure the first note landed", icon: MessageSquare },
  { day: 3, title: "Something useful", detail: "Offers a short list or a quick market snapshot", icon: Mail },
  { day: 7, title: "Friendly re-connect", detail: "Low-pressure: still looking?", icon: MessageSquare },
  { day: 14, title: "Market update", detail: "Keeps you top of mind", icon: Mail },
  { day: 30, title: "Long Game", detail: "Moves to light monthly nurture", icon: CalendarCheck },
];

export default async function AutopilotPage() {
  const user = await requireUser();
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86400000);
  const baseLead = { userId: user.id, ...ACTIVE, autopilot: true };

  const [ready, upcoming, lastAuto, onCount, pausedCount] = await Promise.all([
    db.touch.findMany({
      where: { status: "PENDING", channel: { not: "TASK" }, dueAt: { lte: now }, lead: baseLead },
      include: { lead: true },
      orderBy: { dueAt: "asc" },
      take: 40,
    }),
    db.touch.findMany({
      where: { status: "PENDING", dueAt: { gt: now, lte: week }, lead: baseLead },
      include: { lead: true },
      orderBy: { dueAt: "asc" },
      take: 40,
    }),
    db.touch.findFirst({ where: { completedBy: "autopilot", lead: { userId: user.id, isSample: false } }, orderBy: { completedAt: "desc" } }),
    db.lead.count({ where: baseLead }),
    db.lead.count({ where: { userId: user.id, ...ACTIVE, autopilot: false } }),
  ]);
  const quiet = inQuietHours(user.timezone, user.quietStart, user.quietEnd);
  const connected = !!lastAuto && lastAuto.completedAt! > new Date(now.getTime() - 3 * 86400000);
  const fmtHour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pipeline"
        accent="text-violet-300"
        title="Autopilot"
        subtitle="Your follow-up runs itself — politely, on schedule, and it steps aside the moment someone wants you."
      />

      <div data-tour="autopilot-status" className="grid gap-4 md:grid-cols-3">
        <div className="card card-pad">
          <div className="eyebrow text-violet-300">Leads on autopilot</div>
          <div className="mt-2 font-display text-3xl font-bold text-white">{onCount}</div>
          <div className="text-sm text-slate-500">{pausedCount} paused or handed to you</div>
        </div>
        <div className={clsx("card card-pad", connected ? "" : "border-amber-300/20")}>
          <div className={clsx("eyebrow", connected ? "text-emerald-300" : "text-amber-300")}>Sending engine</div>
          <div className="mt-2 flex items-center gap-2 font-display text-xl font-bold text-white">
            <PlugZap className={clsx("h-5 w-5", connected ? "text-emerald-300" : "text-amber-300")} />
            {connected ? "n8n connected" : "Tap-to-send mode"}
          </div>
          <div className="text-sm text-slate-500">
            {connected ? `Last automatic send ${ago(lastAuto!.completedAt)}` : <>Messages wait for you to tap Send. <Link className="text-violet-300 underline" href="/settings#connections">Connect n8n</Link> to fully automate.</>}
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow text-sky-300">Quiet hours</div>
          <div className="mt-2 flex items-center gap-2 font-display text-xl font-bold text-white">
            <Moon className="h-5 w-5 text-sky-300" /> {fmtHour(user.quietStart)} – {fmtHour(user.quietEnd)}
          </div>
          <div className="text-sm text-slate-500">{quiet ? "Quiet right now — nothing goes out." : "Sending window is open."}</div>
        </div>
      </div>

      {/* Plan */}
      <section data-tour="autopilot-plan" className="card card-pad">
        <SectionTitle>The plan every new lead gets</SectionTitle>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map((s, idx) => (
            <li key={s.day} className="relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-violet-400/15 px-2 py-0.5 text-xs font-bold text-violet-300">Day {s.day}</span>
                <s.icon className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-3 font-semibold text-white">{s.title}</div>
              <div className="mt-1 text-xs text-slate-400">{s.detail}</div>
              {idx < STEPS.length - 1 && <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-white/15 lg:block" />}
            </li>
          ))}
        </ol>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <Rule icon={Hand} tone="text-rose-300">Stops instantly when they reply, book, or ask for a tour — and alerts you.</Rule>
          <Rule icon={Ban} tone="text-amber-300">Never texts without consent. Honors STOP, unsubscribes, and do-not-contact.</Rule>
          <Rule icon={Moon} tone="text-sky-300">Holds messages during quiet hours. Never invents prices, availability, or offers.</Rule>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section data-tour="autopilot-ready">
          <SectionTitle dot="bg-amber-300">
            Ready to send <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-300">{ready.length}</span>
          </SectionTitle>
          {ready.length === 0 ? (
            <p className="card card-pad text-sm text-slate-400">✓ Nothing waiting. Every due message is out the door.</p>
          ) : (
            <ul className="space-y-2.5">
              {ready.map((t) => {
                const href =
                  t.channel === "SMS"
                    ? t.lead.phone && t.lead.smsConsent ? `sms:${t.lead.phone}?&body=${encodeURIComponent(t.message)}` : ""
                    : t.lead.email && !t.lead.emailOptOut ? `mailto:${t.lead.email}?subject=${encodeURIComponent(t.subject ?? "")}&body=${encodeURIComponent(t.message)}` : "";
                return (
                  <li key={t.id} className="card flex items-center gap-3 p-4">
                    <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", t.channel === "SMS" ? "bg-cyan-400/10 text-cyan-300" : "bg-sky-400/10 text-sky-300")}>
                      {t.channel === "SMS" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/leads/${t.leadId}`} className="font-semibold text-white hover:underline">{t.lead.firstName} {t.lead.lastName}</Link>
                      <div className="truncate text-xs text-slate-400">Day {t.day} · {t.label} · due {ago(t.dueAt)}</div>
                    </div>
                    {href ? (
                      <SendTouchButton href={href} action={markTouchAction.bind(null, t.id, false)}><Send className="h-3.5 w-3.5" /> Send</SendTouchButton>
                    ) : (
                      <ActionButton action={markTouchAction.bind(null, t.id, true)} className="btn-ghost btn-sm">Skip</ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle dot="bg-violet-400">Coming up this week</SectionTitle>
          {upcoming.length === 0 ? (
            <p className="card card-pad text-sm text-slate-400">Nothing scheduled in the next 7 days.</p>
          ) : (
            <ul className="card divide-y divide-white/5">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-14 shrink-0 text-xs font-bold text-violet-300">Day {t.day}</span>
                  <Link href={`/leads/${t.leadId}`} className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-slate-100">{t.lead.firstName} {t.lead.lastName}</span>
                    <span className="text-slate-500"> · {t.label}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-slate-400">{ago(t.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Rule({ icon: Icon, tone, children }: { icon: React.ComponentType<{ className?: string }>; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-white/[0.02] p-3">
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", tone)} />
      <span className="text-slate-300">{children}</span>
    </div>
  );
}
