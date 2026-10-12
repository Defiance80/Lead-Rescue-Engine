"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { CheckCircle2, ExternalLink, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import type { Provider } from "@/lib/mail/providers";
import { connectMailboxAction, syncNowAction } from "@/app/inbox-actions";

// ── Connect wizard ────────────────────────────────────────────────────────

export function ConnectMailbox({
  providers,
  initialProvider,
  initialEmail,
}: {
  providers: Provider[];
  initialProvider: string;
  initialEmail?: string;
}) {
  const [key, setKey] = useState(initialProvider);
  const p = providers.find((x) => x.key === key) ?? providers[0];
  return (
    <form action={connectMailboxAction} className="space-y-6">
      <input type="hidden" name="provider" value={p.key} />
      <div>
        <div className="label">1 · Where is the email hosted?</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {providers.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setKey(x.key)}
              className={clsx(
                "rounded-xl border px-3 py-3 text-left text-sm font-semibold transition",
                x.key === p.key ? "border-ember-400 bg-ember-500/10 text-white" : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
        <div className="label text-cyan-200">2 · Get an app password</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-200">
          {p.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {p.helpUrl && (
          <a href={p.helpUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
            Open that page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Why an app password? It's a separate key just for this app — your real password is never shared, and you can revoke it anytime from your email account.
        </p>
      </div>

      <div>
        <div className="label">3 · Connect</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="email" type="email" required defaultValue={initialEmail} placeholder="ian@rusnellrealestate.com" className="input py-3" aria-label="Email address" />
          <input name="password" type="password" required placeholder="App password" autoComplete="off" className="input py-3" aria-label="App password" />
        </div>
        {p.key === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="imapHost" placeholder="IMAP server (e.g. imap.yourhost.com)" className="input" aria-label="IMAP server" />
            <input name="imapPort" placeholder="IMAP port (993)" className="input" aria-label="IMAP port" />
            <input name="smtpHost" placeholder="SMTP server (e.g. smtp.yourhost.com)" className="input" aria-label="SMTP server" />
            <input name="smtpPort" placeholder="SMTP port (465 or 587)" className="input" aria-label="SMTP port" />
            <input name="username" placeholder="Username (if different from email)" className="input sm:col-span-2" aria-label="Username" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5" /> Stored encrypted. Nothing is ever sent until you choose how.
        </p>
        <ConnectButton />
      </div>
    </form>
  );
}

function ConnectButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing the connection…</> : <><ShieldCheck className="h-4 w-4" /> Test & connect</>}
    </button>
  );
}

// ── "Cover me" countdown ──────────────────────────────────────────────────

export function CoverTimer({ due, mode }: { due: string; mode: "approve" | "auto" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="chip bg-white/5 text-slate-400 ring-white/10">…</span>;
  const mins = Math.round((new Date(due).getTime() - now) / 60000);
  if (mins <= 0)
    return <span className="chip bg-violet-400/15 text-violet-200 ring-violet-300/40">Assistant is on it</span>;
  const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.round(mins / 1440)}d`;
  return (
    <span className={clsx("chip", mins < 30 ? "bg-amber-400/15 text-amber-200 ring-amber-300/40" : "bg-violet-400/10 text-violet-200 ring-violet-300/30")} title="If you haven't replied by then, the assistant covers it">
      {mode === "auto" ? "Assistant replies in" : "Draft ready in"} {label}
    </span>
  );
}

// ── Check now / quiet background check ────────────────────────────────────

export function CheckNow({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

  const run = () =>
    start(async () => {
      const r = await syncNowAction();
      setMsg(r.ok ? (r.added ? `${r.added} new email${r.added === 1 ? "" : "s"} sorted` : "You're all caught up") : r.error);
      router.refresh();
    });

  // When the inbox hasn't been checked for a few minutes, check on page open.
  useEffect(() => {
    if (stale && !ran.current) {
      ran.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  return (
    <div className="flex items-center gap-3">
      {msg && !pending && (
        <span className="hidden items-center gap-1.5 text-sm text-slate-300 sm:flex">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" /> {msg}
        </span>
      )}
      <button type="button" onClick={run} disabled={pending} className="btn-secondary">
        <RefreshCw className={clsx("h-4 w-4", pending && "animate-spin")} /> {pending ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
