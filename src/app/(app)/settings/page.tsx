import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, Database, Download, KeyRound, Lock, Moon, PlugZap, RefreshCw, UserRound } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { clearSampleAction, loadSampleAction, regenerateTokenAction, updateSettingsAction } from "../../actions";
import { changePasswordAction } from "../../auth-actions";

export const metadata: Metadata = { title: "Settings" };

const ZONES = [
  ["America/Los_Angeles", "Pacific"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Chicago", "Central"],
  ["America/New_York", "Eastern"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
];

const HOURS = Array.from({ length: 24 }, (_, h) => [h, new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" })] as const);

const PW_MSG: Record<string, { text: string; ok?: boolean }> = {
  saved: { text: "Password updated.", ok: true },
  wrong: { text: "Your current password wasn't right." },
  short: { text: "New passwords need at least 8 characters." },
  mismatch: { text: "The new passwords didn't match." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; pw?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const sampleCount = await db.lead.count({ where: { userId: user.id, isSample: true } });

  const urls = [
    { label: "Lead intake", method: "POST", url: `${base}/api/intake/${user.intakeToken}`, help: "Send every new lead here — from n8n, Zapier, website forms, Facebook Lead Ads, anything." },
    { label: "Engagement events", method: "POST", url: `${base}/api/events/${user.intakeToken}`, help: "Report replies, tour requests, bookings, clicks, unsubscribes." },
    { label: "Autopilot outbox", method: "GET / POST", url: `${base}/api/outbox/${user.intakeToken}`, help: "n8n picks up due messages here, sends them, and reports back." },
  ];

  const curl = `curl -X POST ${urls[0].url} \\
  -H "Content-Type: application/json" \\
  -d '{"first_name":"Jennifer","email":"jen@example.com","phone":"310-555-0142","source":"Website","property":"123 Ocean Ave","city":"Manhattan Beach","message":"Is this still available?"}'`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Settings" title="Settings & Connections" subtitle="Make it sound like you, set your boundaries, and plug in your lead sources." />

      {sp.saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Saved. New follow-up plans will use these settings.
        </div>
      )}

      <form action={updateSettingsAction} className="card card-pad space-y-6">
        <SectionHead icon={UserRound} tone="bg-cyan-400/10 text-cyan-300" title="How you sound" text="Used to sign every message so it reads like it came from you." />
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="displayName">First name in messages</label>
            <input id="displayName" name="displayName" defaultValue={user.displayName ?? user.name?.split(" ")[0] ?? ""} placeholder="Ian" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="businessName">Team / brokerage</label>
            <input id="businessName" name="businessName" defaultValue={user.businessName ?? ""} placeholder="Optional" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Your mobile (for alerts)</label>
            <input id="phone" name="phone" defaultValue={user.phone ?? ""} placeholder="(310) 555-0100" className="input" />
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <SectionHead icon={Moon} tone="bg-sky-400/10 text-sky-300" title="Quiet hours" text="Autopilot never sends texts or emails during these hours. Messages wait until morning." />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="timezone">Time zone</label>
              <select id="timezone" name="timezone" defaultValue={user.timezone} className="input">
                {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="quietStart">Quiet from</label>
              <select id="quietStart" name="quietStart" defaultValue={user.quietStart} className="input">
                {HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="quietEnd">Until</label>
              <select id="quietEnd" name="quietEnd" defaultValue={user.quietEnd} className="input">
                {HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary">Save settings</button>
        </div>
      </form>

      <section id="connections" className="card card-pad scroll-mt-24 space-y-5">
        <SectionHead icon={PlugZap} tone="bg-violet-400/10 text-violet-300" title="Connections" text="Your private links. Anyone with these can add leads to your account — share them only with your automation tools." />
        <div className="space-y-3">
          {urls.map((u) => (
            <div key={u.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{u.label}</span>
                  <span className="rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">{u.method}</span>
                </div>
                <CopyButton text={u.url} label="Copy link" className="btn-secondary btn-sm" />
              </div>
              <code className="mt-2 block break-all rounded-lg bg-ink-950 px-3 py-2 text-xs text-slate-300">{u.url}</code>
              <p className="mt-2 text-xs text-slate-500">{u.help}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <a href="/api/n8n-template" className="btn-cyan"><Download className="h-4 w-4" /> Download n8n workflow (pre-filled)</a>
          <ActionButton
            action={regenerateTokenAction}
            confirm="Create new links? The old ones stop working immediately, so you'll need to update n8n."
            className="btn-ghost"
          >
            <RefreshCw className="h-4 w-4" /> New private links
          </ActionButton>
        </div>

        <details className="rounded-xl border border-white/[0.06] p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-200">
            <KeyRound className="h-4 w-4 text-slate-400" /> Test it yourself (copy into a terminal)
          </summary>
          <div className="mt-3 flex justify-end"><CopyButton text={curl} label="Copy command" /></div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-ink-950 p-3 text-xs text-slate-300">{curl}</pre>
          <p className="mt-3 text-xs text-slate-500">
            Field names are flexible: <code>first_name</code>, <code>firstName</code>, <code>name</code>, <code>phone_number</code>,
            <code> lead_source</code>, Facebook&apos;s <code>field_data</code> and more are all understood.
          </p>
        </details>
      </section>

      <section id="password" className="card card-pad scroll-mt-24">
        <SectionHead
          icon={Lock}
          tone="bg-rose-400/10 text-rose-300"
          title={user.passwordHash ? "Change password" : "Set a password"}
          text={user.passwordHash ? "For signing in with your email." : "Add a password so you can also sign in with your email, not just Google."}
        />
        {sp.pw && PW_MSG[sp.pw] && (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${PW_MSG[sp.pw].ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
            {PW_MSG[sp.pw].text}
          </div>
        )}
        <form action={changePasswordAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          {user.passwordHash && (
            <div>
              <label className="label" htmlFor="current">Current password</label>
              <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <input id="new-password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm</label>
            <input id="confirm-password" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button className="btn-secondary">{user.passwordHash ? "Update password" : "Set password"}</button>
          </div>
        </form>
      </section>

      <section className="card card-pad">
        <SectionHead icon={Database} tone="bg-ember-500/10 text-ember-300" title="Sample data" text="Practice with realistic pretend leads. They're clearly separated from real ones." />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={loadSampleAction}>
            <button className="btn-secondary">{sampleCount ? "Reset sample leads" : "Load sample leads"}</button>
          </form>
          {sampleCount > 0 && (
            <ActionButton action={clearSampleAction} confirm="Remove all sample leads?" className="btn-ghost text-rose-300">
              Remove {sampleCount} sample leads
            </ActionButton>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHead({ icon: Icon, tone, title, text }: { icon: React.ComponentType<{ className?: string }>; tone: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="font-display text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}
