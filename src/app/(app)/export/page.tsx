import type { Metadata } from "next";
import clsx from "clsx";
import { CheckCircle2, Download, FileSpreadsheet, KeyRound, Send, UploadCloud } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PRESETS } from "@/lib/export";
import { TEMPS, temperatureFor } from "@/lib/temperature";
import { PageHeader } from "@/components/ui";
import { pushSyncAction, saveSyncKeysAction } from "../../inbox-actions";

export const metadata: Metadata = { title: "Export & Sync" };

const BRAND: Record<string, string> = {
  mailchimp: "from-yellow-300 to-amber-400 text-ink-950",
  hubspot: "from-orange-500 to-ember-500 text-white",
  followupboss: "from-sky-500 to-blue-600 text-white",
  google: "from-emerald-400 to-cyan-500 text-ink-950",
  full: "from-slate-300 to-slate-400 text-ink-950",
};

type SP = { pushed?: string; ok?: string; skipped?: string; pushError?: string; keys?: string };

export default async function ExportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [leads, sources] = await Promise.all([
    db.lead.findMany({ where: { userId: user.id, doNotContact: false, isSample: false }, select: { score: true, email: true } }),
    db.lead.groupBy({ by: ["source"], where: { userId: user.id }, _count: true }),
  ]);
  const byTemp = TEMPS.map((t) => ({ ...t, n: leads.filter((l) => temperatureFor(l.score) === t.key).length }));
  const withEmail = leads.filter((l) => l.email).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        accent="text-emerald-300"
        title="Export & Sync"
        subtitle="Send your leads to Mailchimp, HubSpot, Follow Up Boss, Google Contacts — or any spreadsheet — sorted by Hot, Warm and Cold."
      />

      {sp.pushed && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          Sent {sp.ok} lead{sp.ok === "1" ? "" : "s"} to {sp.pushed === "mailchimp" ? "Mailchimp" : "HubSpot"}
          {Number(sp.skipped) > 0 && <> · {sp.skipped} skipped (no email or unsubscribed)</>}.
        </div>
      )}
      {sp.pushError && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{sp.pushError}</div>}
      {sp.keys && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">Connection details saved (encrypted).</div>}

      <form className="space-y-6">
        {/* 1. Choose who */}
        <section data-tour="export-filters" className="card card-pad">
          <h2 className="font-display text-base font-bold text-white">1 · Choose who</h2>
          <p className="mb-4 text-sm text-slate-400">{leads.length} leads · {withEmail} with an email address</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="chip cursor-pointer bg-white/5 px-3.5 py-1.5 text-[13px] text-white ring-white/10 has-[:checked]:bg-white has-[:checked]:text-ink-950">
              <input type="radio" name="temperature" value="" defaultChecked className="sr-only" /> Everyone
            </label>
            {byTemp.map((t) => (
              <label key={t.key} className={clsx("chip cursor-pointer px-3.5 py-1.5 text-[13px] has-[:checked]:ring-2 has-[:checked]:brightness-125", t.chip)}>
                <input type="radio" name="temperature" value={t.key} className="sr-only" />
                <span className={clsx("h-2 w-2 rounded-full", t.dot)} /> {t.label} <span className="opacity-60">{t.n}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="priority">Priority</label>
              <select id="priority" name="priority" className="input">
                <option value="">Any priority</option>
                <option value="1">High</option>
                <option value="2">Medium</option>
                <option value="3">Low</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="source">Source</label>
              <select id="source" name="source" className="input">
                <option value="">Any source</option>
                {sources.map((s) => <option key={s.source} value={s.source}>{s.source} ({s._count})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="since">Added since</label>
              <input id="since" name="since" type="date" className="input" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" name="includeClosed" className="accent-ember-500" /> Include "not moving forward"</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="includeSample" className="accent-ember-500" /> Include sample leads</label>
          </div>
        </section>

        {/* 2. Download */}
        <section data-tour="export-download" className="card card-pad">
          <h2 className="font-display text-base font-bold text-white">2 · Download a file for…</h2>
          <p className="mb-4 text-sm text-slate-400">Each file uses the column names that platform's importer expects. Tags include Hot / Warm / Cold, priority and source.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {PRESETS.map((p) => (
              <div key={p.key} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br font-display text-sm font-bold", BRAND[p.key])}>
                  {p.key === "full" ? <FileSpreadsheet className="h-5 w-5" /> : p.label[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{p.label}</div>
                  <p className="mt-0.5 text-xs text-slate-400">{p.blurb}</p>
                  {p.needsEmail && <p className="mt-1 text-xs text-amber-200/80">Only leads with an email who haven&apos;t unsubscribed.</p>}
                </div>
                <button formAction={`/api/export/${p.key}`} formMethod="get" className="btn-secondary btn-sm shrink-0">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Direct sync */}
        <section data-tour="export-sync" className="card card-pad">
          <h2 className="font-display text-base font-bold text-white">3 · Or send them straight in</h2>
          <p className="mb-4 text-sm text-slate-400">Adds new contacts and updates existing ones. Uses the same “Choose who” filters above.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="font-semibold text-white">Mailchimp</div>
              {user.mailchimpKeyEnc ? (
                <>
                  <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
                    <input type="checkbox" name="doubleOptIn" value="on" defaultChecked className="mt-1 accent-ember-500" />
                    <span>Ask new contacts to confirm first (recommended — keeps you compliant)</span>
                  </label>
                  <input type="hidden" name="doubleOptIn" value="off" />
                  <button formAction={pushSyncAction} name="destination" value="mailchimp" className="btn-primary btn-sm mt-3">
                    <Send className="h-3.5 w-3.5" /> Send to Mailchimp
                  </button>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Add your API key below to enable.</p>
              )}
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="font-semibold text-white">HubSpot</div>
              {user.hubspotTokenEnc ? (
                <button formAction={pushSyncAction} name="destination" value="hubspot" className="btn-primary btn-sm mt-3">
                  <UploadCloud className="h-3.5 w-3.5" /> Send to HubSpot
                </button>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Add a private app token below to enable.</p>
              )}
            </div>
          </div>
        </section>
      </form>

      <details className="card card-pad">
        <summary className="flex cursor-pointer items-center gap-2 font-display text-base font-bold text-white">
          <KeyRound className="h-4 w-4 text-slate-400" /> Connect Mailchimp or HubSpot
        </summary>
        <form action={saveSyncKeysAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="label">Mailchimp {user.mailchimpKeyEnc && <span className="text-emerald-300">· connected</span>}</div>
            <input name="mailchimpKey" type="password" placeholder={user.mailchimpKeyEnc ? "•••••••• (saved)" : "API key (ends in -us21 or similar)"} className="input" autoComplete="off" />
            <input name="mailchimpListId" defaultValue={user.mailchimpListId ?? ""} placeholder="Audience ID" className="input" />
            <p className="text-xs text-slate-500">Mailchimp → Profile → Extras → API keys. Audience ID: Audience → Settings → Audience name and defaults.</p>
            {user.mailchimpKeyEnc && <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name="clearMailchimp" /> Disconnect Mailchimp</label>}
          </div>
          <div className="space-y-2">
            <div className="label">HubSpot {user.hubspotTokenEnc && <span className="text-emerald-300">· connected</span>}</div>
            <input name="hubspotToken" type="password" placeholder={user.hubspotTokenEnc ? "•••••••• (saved)" : "Private app access token"} className="input" autoComplete="off" />
            <p className="text-xs text-slate-500">HubSpot → Settings → Integrations → Private Apps → Create, with contacts read/write scopes.</p>
            {user.hubspotTokenEnc && <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name="clearHubspot" /> Disconnect HubSpot</label>}
          </div>
          <div className="md:col-span-2"><button className="btn-secondary">Save connections</button></div>
        </form>
      </details>
    </div>
  );
}
