"use client";

// Interactive pieces that need the browser (timers, clicks, clipboard).

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, Copy, Loader2 } from "lucide-react";

// Live "speed to lead" clock. Green when fresh, amber after 5 min, rose after 1 hr.
export function SpeedClock({ since, respondedAt }: { since: string; respondedAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (respondedAt) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [respondedAt]);

  const start = new Date(since).getTime();
  if (respondedAt) {
    const mins = Math.max(0, Math.round((new Date(respondedAt).getTime() - start) / 60000));
    const label = mins < 1 ? "<1 min" : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} hr` : `${Math.round(mins / 1440)} d`;
    return (
      <span className="chip bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" title="Time to first response">
        <Check className="h-3 w-3" /> Answered in {label}
      </span>
    );
  }
  if (now === null) return <span className="chip bg-white/5 text-slate-400 ring-white/10">Waiting…</span>;
  const mins = Math.max(0, Math.floor((now - start) / 60000));
  const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`;
  const tone =
    mins < 5
      ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30"
      : mins < 60
        ? "bg-amber-400/15 text-amber-200 ring-amber-300/40"
        : "bg-rose-500/15 text-rose-200 ring-rose-400/40";
  return (
    <span className={clsx("chip", tone)} title="Waiting for a first hello">
      <span className={clsx("h-1.5 w-1.5 rounded-full", mins < 5 ? "bg-emerald-300" : mins < 60 ? "bg-amber-300" : "bg-rose-300 pulse-ring")} />
      Waiting {label}
    </span>
  );
}

// A button that runs a server action and shows a spinner while it works.
export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  confirm,
  title,
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title={title}
      disabled={pending}
      className={className}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

// Opens the phone's texting / email app with the message filled in, then
// marks the step done. Works with or without n8n connected.
export function SendTouchButton({
  href,
  action,
  children = "Send",
  className = "btn-primary btn-sm",
}: {
  href: string;
  action: () => Promise<unknown>;
  children?: React.ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        window.open(href, "_self");
        start(async () => {
          await action();
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
