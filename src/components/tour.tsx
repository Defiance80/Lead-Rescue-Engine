"use client";

// Guided tour: short pop-ups that point at parts of the screen and explain
// what they're for. It runs automatically the first time each screen is
// opened (remembered in this browser), and the "?" button replays it anytime.
//
// How it finds things: elements are tagged in the page with data-tour="name".
// A step names one or more of those tags; the first one that's visible wins
// (e.g. the desktop sidebar vs. the phone menu). Steps whose target isn't on
// screen are skipped, so a tour never points at nothing.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, HelpCircle, X } from "lucide-react";

type Step = { target?: string | string[]; title: string; body: string };

const TOURS: Record<string, Step[]> = {
  today: [
    {
      title: "Welcome — quick look around",
      body: "Under a minute. Use Next, or the arrow keys. You can replay this anytime with the ? button in the corner.",
    },
    {
      target: ["nav-act-now", "mobile-nav"],
      title: "Act now",
      body: "Today is home base. Priority Lane lists who's worth your time, best first. Focus Mode shows one lead at a time with nothing else on screen.",
    },
    {
      target: "nav-protect",
      title: "Protect",
      body: "Safety Net catches anyone who might drift — no first hello yet, or a follow-up running late. Rescue Queue holds leads that arrived with a hiccup, like a typo'd email. The little numbers show how many need a look.",
    },
    {
      target: "nav-pipeline",
      title: "Pipeline",
      body: "All Leads is everyone in one place. Autopilot shows the follow-up messages going out on their own. Scoreboard shows what's working.",
    },
    {
      target: ["add-lead", "mobile-add-lead"],
      title: "Add a lead",
      body: "Met someone at an open house or got a call? Drop them in here and they get the same instant care as every other lead.",
    },
    {
      target: "welcome-steps",
      title: "Start here",
      body: "Load the sample leads to see everything in action — you can clear them later in Settings.",
    },
    {
      target: "next-move",
      title: "Your next best move",
      body: "The single most valuable thing to do right now. Not sure where to start? Tap this button and go.",
    },
    {
      target: "momentum",
      title: "Today's momentum",
      body: "How many of today's follow-ups are handled. Watch it fill up as you go.",
    },
    {
      target: "stats",
      title: "Your numbers",
      body: "A quick read on the day. Every tile is clickable and takes you to the people behind the number.",
    },
    {
      target: "priority-lane",
      title: "Priority Lane",
      body: "The people to reach first. The colored edge and score ring show how ready each one is. Tap anyone to open their full profile.",
    },
    {
      target: "temperature",
      title: "Lead temperature",
      body: "These five colors mean the same thing everywhere in the app — from Ready Now (rose) down to Long Game (gray). Tap one to see just those leads.",
    },
    {
      target: "help-button",
      title: "Need a refresher?",
      body: "This button replays the tour for whatever screen you're on.",
    },
  ],
  lead: [
    {
      target: "lead-header",
      title: "Who this is",
      body: "Name, temperature, and how fast they got a first reply. Call, Text, and Email buttons open your phone or email app.",
    },
    {
      target: "at-a-glance",
      title: "At a glance",
      body: "The essentials in one spot: where they came from, what they want, whether they've engaged, and the best next step.",
    },
    {
      target: "follow-up-plan",
      title: "Follow-up plan",
      body: "Every message this lead will get, already written. Ones glowing amber are ready now — open one to send it or mark it done.",
    },
    {
      target: "log-it",
      title: "Log what happened",
      body: "Talked to them another way? One tap keeps the record straight and moves them along.",
    },
    {
      target: "autopilot-card",
      title: "Autopilot",
      body: "Shows whether follow-up is running on its own. It pauses automatically when they reply, so your personal touch lands.",
    },
    {
      target: "why-score",
      title: "Why this score",
      body: "What pushed this lead up or down. Higher means more ready to move.",
    },
    {
      target: "stage",
      title: "Stage",
      body: "Where they are in your process. Tap to change it.",
    },
  ],
  focus: [
    {
      target: "focus-progress",
      title: "One at a time",
      body: "Focus Mode walks you through the Priority Lane one person at a time. This bar shows how far through you are.",
    },
    {
      target: "focus-card",
      title: "Everything you need, nothing you don't",
      body: "Who they are, what they asked, and the single next step for them.",
    },
    {
      target: "focus-send",
      title: "Ready to send",
      body: "A message already written for them. Send it with one tap — or press Enter.",
    },
    {
      target: "focus-other",
      title: "Reached them another way?",
      body: "Tap what you did and the next person appears. Each button shows its keyboard shortcut.",
    },
  ],
  priority: [
    {
      target: "page-title",
      title: "Priority Lane",
      body: "Everyone worth your attention right now, best first: people who asked for you, then fresh leads, then hot ones with follow-ups due. Work top to bottom.",
    },
    {
      target: "focus-button",
      title: "Prefer one at a time?",
      body: "Focus Mode shows this same list one person at a time.",
    },
  ],
  "safety-net": [
    {
      target: "page-title",
      title: "Safety Net",
      body: "Anyone who could drift away lands here: no first hello yet, follow-ups running late, or someone who asked for you without a reply. When it's empty, nothing is slipping.",
    },
  ],
  rescue: [
    {
      target: "page-title",
      title: "Rescue Queue",
      body: "Leads that arrived with a problem — a typo'd email, no phone, a message that didn't send. Nothing gets thrown away.",
    },
    {
      target: "rescue-cards",
      title: "Fix and rescue",
      body: "Correct the details and tap Rescue — the lead goes straight back into your pipeline with a full follow-up plan.",
    },
  ],
  leads: [
    {
      target: "tier-filters",
      title: "Filter by temperature",
      body: "Tap a color to see just those leads. Tap it again to clear it.",
    },
    {
      target: "lead-search",
      title: "Search and sort",
      body: "Find anyone by name, phone, email, address, or city. Narrow by stage or source.",
    },
  ],
  autopilot: [
    {
      target: "autopilot-status",
      title: "Autopilot at a glance",
      body: "How many leads are being followed up automatically, whether texts and emails send on their own yet, and your quiet hours.",
    },
    {
      target: "autopilot-plan",
      title: "The plan every lead gets",
      body: "Day 0 through Day 30. It stops the moment someone replies and hands them to you.",
    },
    {
      target: "autopilot-ready",
      title: "Ready to send",
      body: "Messages due now. Until automatic sending is connected, tap Send — it opens your phone with the message filled in.",
    },
  ],
  scoreboard: [
    {
      target: "range",
      title: "Pick a time range",
      body: "Switch between the last 7, 30, or 90 days.",
    },
    {
      target: "funnel",
      title: "From hello to client",
      body: "How many leads made it through each step.",
    },
    {
      target: "sources",
      title: "Best lead sources",
      body: "Which sources turn into real conversations — handy for deciding where to spend.",
    },
  ],
  settings: [
    {
      target: "settings-profile",
      title: "How you sound",
      body: "The name that signs every message, and quiet hours when nothing goes out.",
    },
    {
      target: "connections",
      title: "Connections",
      body: "Private links for bringing leads in automatically. Usually set up once, by whoever handles your automations.",
    },
  ],
  new: [
    {
      target: "page-title",
      title: "Add a lead",
      body: "Fill in what you know — just a name plus a phone or email is enough. A personal follow-up plan is built the moment you save.",
    },
  ],
};

function tourKeyFor(path: string): string | null {
  if (path === "/today") return "today";
  if (path === "/leads/new") return "new";
  if (path === "/leads") return "leads";
  if (path.startsWith("/leads/")) return "lead";
  const key = path.split("/")[1];
  return key && key in TOURS ? key : null;
}

const storageKey = (k: string) => `lr-tour-seen:${k}`;

function seen(k: string) {
  try {
    return localStorage.getItem(storageKey(k)) === "1";
  } catch {
    return true; // storage blocked — don't nag on every page load
  }
}
function markSeen(k: string) {
  try {
    localStorage.setItem(storageKey(k), "1");
  } catch {
    /* ignore */
  }
}

function findTarget(target: Step["target"]): HTMLElement | null {
  if (!target) return null;
  for (const name of Array.isArray(target) ? target : [target]) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export function Tour() {
  const path = usePathname();
  const key = tourKeyFor(path);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 360, h: 200 });
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const start = useCallback(() => {
    if (!key) return;
    // Keep only steps that are on screen right now (or have no target).
    const visible = TOURS[key].filter((s) => !s.target || findTarget(s.target));
    if (visible.length) {
      setSteps(visible);
      setI(0);
    }
  }, [key]);

  const close = useCallback(() => {
    if (key) markSeen(key);
    setSteps(null);
    setRect(null);
  }, [key]);

  // First visit to a screen → start its tour after the page settles.
  useEffect(() => {
    setSteps(null);
    if (!key || seen(key)) return;
    const t = setTimeout(start, 800);
    return () => clearTimeout(t);
  }, [key, start]);

  const step = steps?.[i];

  // Find, scroll to, and measure the highlighted element.
  useEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    if (el) {
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 80 || r.bottom > window.innerHeight - 40;
      if (offscreen) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    measure();
    const t = setTimeout(measure, 380); // after smooth scroll
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    nextRef.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) {
      const r = cardRef.current.getBoundingClientRect();
      setCardSize((s) => (Math.abs(s.h - r.height) > 1 || Math.abs(s.w - r.width) > 1 ? { w: r.width, h: r.height } : s));
    }
  });

  // Keyboard: arrows / Enter / Esc. Captured first so page shortcuts (like
  // Focus Mode's Enter-to-send) don't fire while the tour is open.
  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowRight", "ArrowLeft", "Enter", "Escape"].includes(e.key) && e.key.length !== 1) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (i < steps.length - 1) setI(i + 1);
        else close();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (i > 0) setI(i - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [steps, i, close]);

  const helpButton = key ? (
    <button
      type="button"
      data-tour="help-button"
      onClick={start}
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-ember-500 to-rose-500 py-3 pl-3 pr-3 text-sm font-semibold text-white shadow-lg shadow-ember-500/30 transition hover:pr-4 hover:brightness-110"
      aria-label="Show me around this screen"
    >
      <HelpCircle className="h-5 w-5" />
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap transition-all group-hover:max-w-40 sm:inline">Show me around</span>
    </button>
  ) : null;

  if (!steps || !step) return helpButton;

  // ── Where the pop-up card goes ──────────────────────────────────────────
  const pad = 8;
  const gap = 14;
  const margin = 12;
  const cardW = Math.min(360, viewport.w - margin * 2);
  let cardTop: number;
  let cardLeft: number;
  if (!rect) {
    cardTop = (viewport.h - cardSize.h) / 2;
    cardLeft = (viewport.w - cardW) / 2;
  } else if (rect.left + rect.width < 330 && viewport.w > 700) {
    // Things in the sidebar: put the card to the right.
    cardLeft = rect.left + rect.width + pad + gap;
    cardTop = rect.top + rect.height / 2 - cardSize.h / 2;
  } else {
    const below = rect.top + rect.height + pad + gap;
    const above = rect.top - pad - gap - cardSize.h;
    if (below + cardSize.h <= viewport.h - margin) cardTop = below;
    else if (above >= margin) cardTop = above;
    else cardTop = viewport.h - cardSize.h - margin; // tall element: pin to bottom
    cardLeft = rect.left + rect.width / 2 - cardW / 2;
  }
  cardTop = Math.max(margin, Math.min(cardTop, viewport.h - cardSize.h - margin));
  cardLeft = Math.max(margin, Math.min(cardLeft, viewport.w - cardW - margin));

  const last = i === steps.length - 1;

  return (
    <>
      {helpButton}
      {/* Clicking anywhere on the dimmed area closes the tour, so it can never
          leave the page stuck (e.g. if the card ends up off-screen). Scrolling
          still works underneath. */}
      <div className="fixed inset-0 z-[60] cursor-pointer" onClick={close} title="Click to close the tour" aria-hidden />
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[61] rounded-2xl ring-2 ring-ember-400 transition-all duration-300"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(3 6 12 / 0.74), 0 0 30px 4px rgb(255 90 54 / 0.35)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[61] bg-[rgb(3_6_12/0.74)]" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="rise fixed z-[62] rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-2xl shadow-black/60"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="eyebrow text-ember-300">
            {i + 1} of {steps.length}
          </div>
          <button type="button" onClick={close} className="-m-1 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="tour-title" className="font-display text-lg font-bold text-white">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-300">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-ember-400" : "w-1.5 bg-white/20"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 ? (
              <button type="button" onClick={() => setI(i - 1)} className="btn-ghost btn-sm">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : (
              <button type="button" onClick={close} className="btn-ghost btn-sm">
                Skip
              </button>
            )}
            <button ref={nextRef} type="button" onClick={() => (last ? close() : setI(i + 1))} className="btn-primary btn-sm">
              {last ? "Got it" : "Next"} {!last && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
