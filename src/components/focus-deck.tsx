"use client";

// Focus Mode: one lead at a time, big buttons, keyboard shortcuts, and a
// progress bar. Designed to make a long list feel like a quick game.

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Copy, Keyboard, Loader2, Mail, MapPin, MessageSquare, Moon, Phone, PartyPopper, Quote } from "lucide-react";
import { tierFor } from "@/lib/tiers";
import { logContactAction, markTouchAction, snoozeAction } from "@/app/actions";
import { SpeedClock } from "./client";

export type FocusCard = {
  id: string;
  firstName: string;
  lastName: string | null;
  score: number;
  phone: string | null;
  email: string | null;
  smsOk: boolean;
  where: string | null;
  budget: string | null;
  source: string;
  inquiry: string | null;
  createdAt: string;
  respondedAt: string | null;
  headline: string;
  why: string;
  touch: { id: string; channel: "SMS" | "EMAIL" | "TASK"; label: string; subject: string | null; message: string } | null;
};

export function FocusDeck({ cards: initial }: { cards: FocusCard[] }) {
  // Snapshot the list once so the deck doesn't reshuffle while you work it.
  const [cards] = useState(initial);
  const [i, setI] = useState(0);
  const [handled, setHandled] = useState(0);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const card = cards[i];

  const advance = useCallback((didSomething: boolean) => {
    if (didSomething) setHandled((h) => h + 1);
    setCopied(false);
    setI((x) => x + 1);
  }, []);

  const run = useCallback(
    (fn: () => Promise<unknown>, didSomething = true) => {
      start(async () => {
        await fn();
        advance(didSomething);
      });
    },
    [advance],
  );

  const sendTouch = useCallback(() => {
    if (!card?.touch) return;
    const t = card.touch;
    const href =
      t.channel === "SMS" && card.phone
        ? `sms:${card.phone}?&body=${encodeURIComponent(t.message)}`
        : card.email
          ? `mailto:${card.email}?subject=${encodeURIComponent(t.subject ?? "")}&body=${encodeURIComponent(t.message)}`
          : null;
    if (href) window.open(href, "_self");
    run(() => markTouchAction(t.id));
  }, [card, run]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card || pending) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "enter" && card.touch) sendTouch();
      else if (k === "c") run(() => logContactAction(card.id, "call"));
      else if (k === "t") run(() => logContactAction(card.id, "sms"));
      else if (k === "e") run(() => logContactAction(card.id, "email"));
      else if (k === "s") run(() => snoozeAction(card.id, 1));
      else if (k === "arrowright" || k === "n") advance(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, pending, run, advance, sendTouch]);

  const progress = cards.length ? Math.min(100, (i / cards.length) * 100) : 100;

  if (!card) {
    return (
      <div className="mx-auto max-w-xl pt-10 text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-ink-950 shadow-xl shadow-emerald-500/20">
          <PartyPopper className="h-10 w-10" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold text-white">
          {cards.length === 0 ? "Nothing needs you right now" : "Lane cleared!"}
        </h1>
        <p className="mt-2 text-lg text-slate-400">
          {cards.length === 0
            ? "Autopilot has everyone covered. Go sell a house."
            : `You handled ${handled} ${handled === 1 ? "lead" : "leads"}. Every one of them just felt looked after.`}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Link href="/today" className="btn-primary">Back to Today</Link>
          <Link href="/safety-net" className="btn-secondary">Check the Safety Net</Link>
        </div>
      </div>
    );
  }

  const t = tierFor(card.score);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress */}
      <div data-tour="focus-progress" className="mb-6 flex items-center gap-4">
        <div className="eyebrow text-fuchsia-300">Focus Mode</div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-ember-500 via-rose-500 to-fuchsia-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="font-display text-sm font-bold text-white">
          {i + 1} <span className="text-slate-500">/ {cards.length}</span>
        </div>
      </div>

      <div key={card.id} data-tour="focus-card" className="rise relative overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-850">
        <div className={clsx("h-1.5", t.bar)} />
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("chip", t.chip)}><span className={clsx("h-1.5 w-1.5 rounded-full", t.dot)} />{t.label} · {card.score}</span>
            <SpeedClock since={card.createdAt} respondedAt={card.respondedAt} />
            <span className="chip bg-white/5 text-slate-400 ring-white/10">{card.source}</span>
          </div>

          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {card.firstName} {card.lastName}
          </h1>
          {(card.where || card.budget) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300">
              {card.where && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-ember-300" />{card.where}</span>}
              {card.budget && <span>{card.budget}</span>}
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-gradient-to-r from-ember-500/15 to-fuchsia-500/10 p-4 ring-1 ring-inset ring-ember-400/20">
            <div className="font-display text-lg font-bold text-white">{card.headline}</div>
            <div className="text-sm text-slate-300">{card.why}</div>
          </div>

          {card.inquiry && (
            <p className="mt-4 flex gap-2 text-[15px] italic text-slate-400">
              <Quote className="h-4 w-4 shrink-0 text-slate-500" /> {card.inquiry}
            </p>
          )}

          {card.touch && (
            <div data-tour="focus-send" className="mt-6">
              <div className="eyebrow mb-2">Ready-to-send {card.touch.channel === "SMS" ? "text" : "email"} · {card.touch.label}</div>
              <p className="whitespace-pre-line rounded-xl bg-ink-950/70 p-4 text-sm leading-relaxed text-slate-200">{card.touch.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={pending} onClick={sendTouch}>
                  {card.touch.channel === "SMS" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  Send it <Kbd>Enter</Kbd>
                </button>
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(card.touch!.message);
                    setCopied(true);
                  }}
                >
                  <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <div data-tour="focus-other" className="mt-8 border-t border-white/5 pt-6">
            <div className="eyebrow mb-3">Reached them another way?</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {card.phone ? (
                <a href={`tel:${card.phone}`} onClick={() => run(() => logContactAction(card.id, "call"))} className="btn-secondary">
                  <Phone className="h-4 w-4 text-ember-300" /> Call <Kbd>C</Kbd>
                </a>
              ) : (
                <span />
              )}
              <button className="btn-secondary" disabled={pending} onClick={() => run(() => logContactAction(card.id, "sms"))}>
                <MessageSquare className="h-4 w-4 text-cyan-300" /> Texted <Kbd>T</Kbd>
              </button>
              <button className="btn-secondary" disabled={pending} onClick={() => run(() => logContactAction(card.id, "email"))}>
                <Mail className="h-4 w-4 text-sky-300" /> Emailed <Kbd>E</Kbd>
              </button>
              <button className="btn-secondary" disabled={pending} onClick={() => run(() => snoozeAction(card.id, 1))}>
                <Moon className="h-4 w-4 text-violet-300" /> Tomorrow <Kbd>S</Kbd>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="hidden items-center gap-2 text-slate-500 sm:flex">
          <Keyboard className="h-4 w-4" /> Keyboard friendly — shortcuts shown on each button
        </span>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <Link href={`/leads/${card.id}`} className="btn-ghost btn-sm">Full profile</Link>
          <button className="btn-ghost btn-sm" onClick={() => advance(false)}>
            Next <ArrowRight className="h-3.5 w-3.5" /> <Kbd>N</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden rounded-md border border-white/15 bg-black/20 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-current opacity-70 sm:inline">
      {children}
    </kbd>
  );
}
