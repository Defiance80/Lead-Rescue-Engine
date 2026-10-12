import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Inbox,
  MailCheck,
  MailOpen,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { InboxItem } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PROVIDERS, guessProvider } from "@/lib/mail/providers";
import { aiEnabled } from "@/lib/assistant/analyze";
import { riskReason } from "@/lib/assistant/process";
import { tempMeta, priorityMeta } from "@/lib/temperature";
import { ago, startOfToday } from "@/lib/time";
import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { CheckNow, ConnectMailbox, CoverTimer } from "@/components/inbox-client";
import {
  coverMeAction,
  disconnectMailboxAction,
  sendDraftAction,
  setItemStatusAction,
  turnIntoLeadAction,
  updateAssistantAction,
} from "../../inbox-actions";

export const metadata: Metadata = { title: "Inbox Assistant" };

const CATEGORY: Record<string, { label: string; cls: string }> = {
  new_lead: { label: "New lead", cls: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30" },
  client: { label: "Client", cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" },
  vendor_partner: { label: "Partner / vendor", cls: "bg-sky-500/15 text-sky-200 ring-sky-400/30" },
  personal: { label: "Personal", cls: "bg-violet-500/15 text-violet-200 ring-violet-400/30" },
  newsletter_promo: { label: "Newsletter", cls: "bg-white/5 text-slate-400 ring-white/10" },
  spam: { label: "Spam", cls: "bg-white/5 text-slate-500 ring-white/10" },
  other: { label: "Other", cls: "bg-white/5 text-slate-300 ring-white/10" },
};

const STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: "Draft ready — tap to send", cls: "bg-ember-500 text-white ring-ember-300/40" },
  held: { label: "Needs you personally", cls: "bg-rose-500 text-white ring-rose-300/40" },
  sent: { label: "Assistant replied", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30" },
  you_replied: { label: "You replied", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30" },
  done: { label: "No reply needed", cls: "bg-white/5 text-slate-400 ring-white/10" },
  skipped: { label: "Skipped", cls: "bg-white/5 text-slate-500 ring-white/10" },
};

const WINDOWS = [
  [15, "15 minutes"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [480, "8 hours"],
  [1440, "Next day"],
] as const;

type SP = { view?: string; error?: string; provider?: string; email?: string; connected?: string; saved?: string; sendError?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const acc = await db.mailAccount.findUnique({ where: { userId: user.id } });

  if (!acc) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Act now"
          accent="text-violet-300"
          title="Inbox Assistant"
          subtitle="Connect your email and the assistant reads every new message, sorts it, moves leads into your pipeline — and covers you when you get busy."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Sparkles, tone: "bg-violet-400/12 text-violet-300", t: "Reads & sorts", d: "Lead, client, vendor or junk — marked Hot, Warm or Cold with a priority." },
            { icon: UserPlus, tone: "bg-fuchsia-400/12 text-fuchsia-300", t: "Leads go straight in", d: "Names, phones, budgets and properties pulled out and added to your pipeline." },
            { icon: Clock, tone: "bg-amber-400/12 text-amber-300", t: "Covers you", d: "Haven't replied in your set time? A short, personal reply goes out with your booking link." },
            { icon: ShieldAlert, tone: "bg-rose-400/12 text-rose-300", t: "Protects you", d: "Wire-fraud attempts and sensitive emails are flagged — never auto-answered." },
          ].map((f) => (
            <div key={f.t} className="card card-pad">
              <span className={clsx("grid h-10 w-10 place-items-center rounded-xl", f.tone)}>
                <f.icon className="h-5 w-5" />
              </span>
              <div className="mt-3 font-display font-bold text-white">{f.t}</div>
              <p className="mt-1 text-sm text-slate-400">{f.d}</p>
            </div>
          ))}
        </div>
        <section data-tour="inbox-connect" className="card card-pad">
          <h2 className="mb-5 font-display text-lg font-bold text-white">Connect your email</h2>
          {sp.error && (
            <div className="mb-5 flex gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" /> {sp.error}
            </div>
          )}
          <ConnectMailbox
            providers={PROVIDERS}
            initialProvider={sp.provider ?? guessProvider(user.email ?? "")}
            initialEmail={sp.email ?? user.email ?? undefined}
          />
        </section>
      </div>
    );
  }

  const now = new Date();
  const today = startOfToday(user.timezone, now);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const view = sp.view ?? "needs";
  const mode = acc.mode === "auto" ? "auto" : "approve";

  const [needs, covering, leadsToday, handled, youReplied, items] = await Promise.all([
    db.inboxItem.count({ where: { userId: user.id, status: { in: ["ready", "held"] } } }),
    db.inboxItem.count({ where: { userId: user.id, status: "waiting" } }),
    db.inboxItem.count({ where: { userId: user.id, category: "new_lead", receivedAt: { gte: today } } }),
    db.inboxItem.count({ where: { userId: user.id, status: "sent", sentAt: { gte: weekAgo } } }),
    db.inboxItem.count({ where: { userId: user.id, status: "you_replied", repliedAt: { gte: weekAgo } } }),
    db.inboxItem.findMany({
      where: {
        userId: user.id,
        ...(view === "needs"
          ? { status: { in: ["ready", "held", "waiting"] } }
          : view === "leads"
            ? { category: "new_lead" }
            : view === "handled"
              ? { status: { in: ["sent", "you_replied", "done", "skipped"] } }
              : {}),
      },
      orderBy: view === "needs" ? [{ priority: "asc" }, { receivedAt: "desc" }] : { receivedAt: "desc" },
      take: 100,
    }),
  ]);
  // "Needs you" first, then the soonest timers.
  const order = { held: 0, ready: 1, waiting: 2 } as Record<string, number>;
  if (view === "needs") items.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.assistantDueAt?.getTime() ?? 0) - (b.assistantDueAt?.getTime() ?? 0));

  const stale = !acc.lastSyncAt || now.getTime() - acc.lastSyncAt.getTime() > 3 * 60000;
  const tabs = [
    ["needs", "Needs attention", needs + covering],
    ["leads", "Leads", null],
    ["handled", "Handled", null],
    ["all", "Everything", null],
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Act now"
        accent="text-violet-300"
        title="Inbox Assistant"
        subtitle={
          <>
            Watching <b className="text-white">{acc.email}</b> · checked {acc.lastSyncAt ? ago(acc.lastSyncAt) : "not yet"}
            {!acc.enabled && <span className="ml-2 text-amber-300">· paused</span>}
          </>
        }
        actions={<CheckNow stale={stale && acc.enabled} />}
      />

      {sp.connected && <Banner tone="emerald">Connected! The assistant just read your recent emails — here's what it found.</Banner>}
      {sp.saved && <Banner tone="emerald">Saved. New emails will follow these settings.</Banner>}
      {sp.sendError && <Banner tone="rose">That email didn't send — the reason is shown on the message below and in the Rescue Queue.</Banner>}
      {acc.lastError && <Banner tone="rose">Last check had a problem: {acc.lastError}</Banner>}
      {!aiEnabled() && (
        <Banner tone="amber">
          Running in basic mode (keyword sorting and a simple reply). Add an <code>ANTHROPIC_API_KEY</code> in Vercel for smart sorting, detail extraction and replies written for each email.
        </Banner>
      )}

      <div data-tour="inbox-stats" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Needs you" value={needs} hint="Drafts ready + flagged" icon={AlertTriangle} tone="rose" href="/inbox?view=needs" />
        <StatTile label="Being covered" value={covering} hint="Timer running" icon={Clock} tone="violet" href="/inbox?view=needs" />
        <StatTile label="New leads today" value={leadsToday} hint="Added to your pipeline" icon={UserPlus} tone="ember" href="/inbox?view=leads" />
        <StatTile label="Handled for you" value={handled} hint="Last 7 days" icon={Bot} tone="emerald" href="/inbox?view=handled" />
        <StatTile label="You replied" value={youReplied} hint="Assistant stood down" icon={MailCheck} tone="cyan" href="/inbox?view=handled" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section>
          <div data-tour="inbox-tabs" className="mb-4 flex flex-wrap gap-2">
            {tabs.map(([key, label, n]) => (
              <Link
                key={key}
                href={`/inbox?view=${key}`}
                className={clsx("chip px-3.5 py-1.5 text-[13px]", view === key ? "bg-white text-ink-950 ring-white" : "bg-white/5 text-white ring-white/10 hover:bg-white/10")}
              >
                {label} {n ? <span className="opacity-60">{n}</span> : null}
              </Link>
            ))}
          </div>

          {items.length === 0 ? (
            <EmptyState icon={view === "needs" ? CheckCircle2 : Inbox} title={view === "needs" ? "Nothing needs you" : "No emails here yet"}>
              {view === "needs" ? "Every email is answered or doesn't need a reply. Nice." : "New emails show up here after each check."}
            </EmptyState>
          ) : (
            <ul data-tour="inbox-list" className="space-y-2.5">
              {items.map((it) => <EmailRow key={it.id} it={it} mode={mode} />)}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <form data-tour="inbox-settings" action={updateAssistantAction} className="card card-pad space-y-4">
            <h2 className="font-display text-base font-bold text-white">How the assistant helps</h2>
            <fieldset className="space-y-2">
              <legend className="label">When your timer runs out</legend>
              {[
                ["approve", "Have a draft ready for me", "Recommended to start — you tap Send."],
                ["auto", "Send the reply for me", "Leads and clients only. Never for flagged or personal emails."],
              ].map(([v, t, d]) => (
                <label key={v} className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 has-[:checked]:border-violet-400/60 has-[:checked]:bg-violet-400/10">
                  <input type="radio" name="mode" value={v} defaultChecked={acc.mode === v} className="mt-1 accent-violet-400" />
                  <span>
                    <span className="block text-sm font-semibold text-white">{t}</span>
                    <span className="text-xs text-slate-400">{d}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="replyWindowMins">Cover me if I haven't replied in</label>
              <select id="replyWindowMins" name="replyWindowMins" defaultValue={acc.replyWindowMins} className="input">
                {WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="signAs">Sign replies as</label>
              <select id="signAs" name="signAs" defaultValue={acc.signAs} className="input">
                <option value="agent">Me ({user.displayName || user.name || "you"})</option>
                <option value="assistant">My assistant</option>
              </select>
              <input name="assistantName" defaultValue={acc.assistantName ?? ""} placeholder="Assistant's name (optional)" className="input mt-2" />
            </div>
            <div>
              <label className="label" htmlFor="enabled">Status</label>
              <select id="enabled" name="enabled" defaultValue={acc.enabled ? "on" : "off"} className="input">
                <option value="on">On — checking my inbox</option>
                <option value="off">Paused</option>
              </select>
            </div>
            <p className="flex gap-2 rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400">
              <CalendarClock className="h-4 w-4 shrink-0 text-violet-300" />
              <span>
                {user.bookingUrl ? <>Replies end with your booking link.</> : <>Add your booking link in <Link href="/settings" className="text-violet-300 underline">Settings</Link> and replies will end with it.</>}{" "}
                Quiet hours are respected.
              </span>
            </p>
            <button className="btn-primary w-full">Save</button>
          </form>

          <details className="card card-pad text-sm">
            <summary className="cursor-pointer font-semibold text-white">Keep it checking automatically</summary>
            <p className="mt-2 text-slate-400">
              The assistant checks whenever this page is open. To check every 5 minutes around the clock, create a free job at <b>cron-job.org</b> that opens:
            </p>
            <code className="mt-2 block break-all rounded-lg bg-ink-950 p-2 text-xs text-slate-300">https://YOUR-SITE/api/cron/inbox?key=YOUR_CRON_SECRET</code>
            <p className="mt-2 text-xs text-slate-500">Use the CRON_SECRET value from your Vercel settings.</p>
          </details>

          <form action={disconnectMailboxAction} className="text-center">
            <button className="text-xs text-slate-500 underline hover:text-rose-300">Disconnect {acc.email}</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function EmailRow({ it, mode }: { it: InboxItem; mode: "approve" | "auto" }) {
  const cat = CATEGORY[it.category] ?? CATEGORY.other;
  const temp = it.temperature ? tempMeta(it.temperature) : null;
  const prio = priorityMeta(it.priority);
  const c = (it.extracted ?? {}) as Record<string, string | number | null>;
  const open = it.status === "ready" || it.status === "held";
  const details = [
    ["Name", [c.first_name, c.last_name].filter(Boolean).join(" ")],
    ["Email", c.email],
    ["Phone", c.phone],
    ["Property", c.property_address],
    ["Area", c.city],
    ["Budget", [c.budget_min, c.budget_max].filter(Boolean).map((n) => `$${Number(n).toLocaleString()}`).join(" – ")],
    ["Timeline", c.timeline],
    ["Financing", c.financing],
  ].filter(([, v]) => v);

  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/80">
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none gap-4 p-4 hover:bg-white/[0.02]">
          <span className={clsx("w-1 shrink-0 self-stretch rounded-full", temp?.dot ?? "bg-white/10")} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{it.fromName || it.fromEmail}</span>
              <span className={clsx("chip", cat.cls)}>{cat.label}</span>
              {temp && it.category !== "newsletter_promo" && <span className={clsx("chip", temp.chip)}>{temp.label}</span>}
              {it.priority === 1 && <span className={clsx("chip", prio.chip)}>High priority</span>}
              <span className="ml-auto text-xs text-slate-500">{ago(it.receivedAt)}</span>
            </div>
            <div className="mt-1 truncate text-sm text-slate-200">{it.subject}</div>
            <div className="mt-0.5 line-clamp-2 text-[13px] text-slate-400">{it.summary ?? it.snippet}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {it.status === "waiting" && it.assistantDueAt ? (
                <CoverTimer due={it.assistantDueAt.toISOString()} mode={it.autoAllowed ? mode : "approve"} />
              ) : STATUS[it.status] ? (
                <span className={clsx("chip", STATUS[it.status].cls)}>{STATUS[it.status].label}</span>
              ) : null}
              {it.leadId && (
                <Link href={`/leads/${it.leadId}`} className="chip bg-white/5 text-white ring-white/10 hover:bg-white/10">
                  <Users className="h-3 w-3" /> Open lead
                </Link>
              )}
            </div>
          </div>
        </summary>

        <div className="space-y-4 border-t border-white/5 p-4">
          {it.riskFlag && (
            <div className="flex gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-300" />
              <span><b>{riskReason(it.riskFlag)}.</b> The assistant won't reply to this one automatically.</span>
            </div>
          )}
          {it.sendError && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">Didn't send: {it.sendError}</div>}

          {details.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {details.map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</div>
                  <div className="truncate text-sm text-white">{String(v)}</div>
                </div>
              ))}
            </div>
          )}

          <details className="rounded-xl bg-white/[0.02] p-3 text-sm">
            <summary className="cursor-pointer text-slate-300"><MailOpen className="mr-1.5 inline h-4 w-4" />Their message</summary>
            <p className="mt-2 max-h-64 overflow-auto whitespace-pre-line text-slate-400">{it.bodyText}</p>
          </details>

          {it.riskFlag === "wire_fraud" && ["waiting", "ready", "held"].includes(it.status) && (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={setItemStatusAction.bind(null, it.id, "done")} className="btn-secondary btn-sm">I verified it by phone — done</ActionButton>
              <ActionButton action={setItemStatusAction.bind(null, it.id, "skipped")} className="btn-ghost btn-sm">It's a scam — ignore</ActionButton>
            </div>
          )}

          {it.riskFlag !== "wire_fraud" && ["waiting", "ready", "held"].includes(it.status) && it.draftBody && (
            <form action={sendDraftAction} className="space-y-2">
              <input type="hidden" name="itemId" value={it.id} />
              <div className="label">Reply (edit anything before sending)</div>
              <input name="subject" defaultValue={it.draftSubject ?? `Re: ${it.subject}`} className="input" aria-label="Subject" />
              <textarea name="body" defaultValue={it.draftBody} rows={5} className="input" aria-label="Reply" />
              <p className="text-xs text-slate-500">Your signature and booking link are added automatically.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary btn-sm"><MailCheck className="h-3.5 w-3.5" /> Send now</button>
                <ActionButton action={setItemStatusAction.bind(null, it.id, "you_replied")} className="btn-secondary btn-sm">I already replied</ActionButton>
                {it.status === "held" ? (
                  <ActionButton action={coverMeAction.bind(null, it.id)} className="btn-ghost btn-sm">It's fine — cover me</ActionButton>
                ) : (
                  <ActionButton action={setItemStatusAction.bind(null, it.id, "held")} className="btn-ghost btn-sm">I'll handle this one</ActionButton>
                )}
                <ActionButton action={setItemStatusAction.bind(null, it.id, "done")} className="btn-ghost btn-sm">No reply needed</ActionButton>
              </div>
            </form>
          )}

          {!it.leadId && it.category !== "newsletter_promo" && it.category !== "spam" && (
            <ActionButton action={turnIntoLeadAction.bind(null, it.id)} className="btn-secondary btn-sm">
              <UserPlus className="h-3.5 w-3.5" /> Add to my leads
            </ActionButton>
          )}
        </div>
      </details>
    </li>
  );
}

function Banner({ tone, children }: { tone: "emerald" | "rose" | "amber"; children: React.ReactNode }) {
  const t = {
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    amber: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  }[tone];
  return <div className={clsx("rounded-2xl border p-4 text-sm", t)}>{children}</div>;
}
