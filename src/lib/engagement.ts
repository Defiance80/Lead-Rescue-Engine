// What happens when a lead DOES something (replies, books, clicks…) and when
// the agent or autopilot reaches out. Shared by the API routes and the UI.

import type { Lead, LeadStatus } from "@prisma/client";
import { db } from "./db";
import { addSignals, scoreFor, type SignalKey } from "./scoring";
import { priceRange } from "./time";

export const EVENT_TYPES = {
  reply_text: { label: "Replied by text", signal: "replied_text", strong: true },
  reply_email: { label: "Replied by email", signal: "replied_email", strong: true },
  showing_request: { label: "Asked for a showing", signal: "showing_requested", strong: true },
  calendar_booked: { label: "Booked an appointment", signal: "calendar_booked", strong: true },
  mortgage_question: { label: "Asked a mortgage question", signal: null, strong: true },
  valuation_request: { label: "Asked what their home is worth", signal: "valuation_request", strong: true },
  seller_inquiry: { label: "Asked about selling", signal: "home_to_sell", strong: true },
  website_visit: { label: "Came back to the website", signal: "returned", strong: false },
  viewed_properties: { label: "Viewed several properties", signal: "viewed_multiple", strong: false },
  link_click: { label: "Clicked a link", signal: "link_clicked", strong: false },
  unsubscribe: { label: "Unsubscribed", signal: "unsubscribed", strong: false },
  sms_stop: { label: "Texted STOP", signal: null, strong: false },
  invalid_phone: { label: "Phone number bounced", signal: "invalid_phone", strong: false },
} as const satisfies Record<string, { label: string; signal: SignalKey | null; strong: boolean }>;

export type EventType = keyof typeof EVENT_TYPES;

export function fullName(l: Pick<Lead, "firstName" | "lastName">) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ");
}

export function alertText(lead: Lead, what: string, note?: string | null) {
  const parts = [`HOT LEAD: ${fullName(lead)} — ${what.toLowerCase()}.`];
  if (lead.property) parts.push(`Interested in ${lead.property}.`);
  else if (lead.city) parts.push(`Looking in ${lead.city}.`);
  const budget = priceRange(lead.priceMin, lead.priceMax);
  if (budget) parts.push(`Budget appears to be ${budget}.`);
  if (note) parts.push(`"${note}"`);
  return parts.join(" ");
}

export async function recordEvent(
  userId: string,
  leadId: string,
  type: EventType,
  note: string | null,
  actor: string,
) {
  const lead = await db.lead.findFirstOrThrow({ where: { id: leadId, userId } });
  const def = EVENT_TYPES[type];
  const signals = def.signal ? addSignals(lead.signals, [def.signal]) : lead.signals;
  const score = scoreFor(signals);
  const now = new Date();

  const data: Parameters<typeof db.lead.update>[0]["data"] = {
    signals,
    score,
  };
  let alert: string | null = null;

  if (def.strong) {
    alert = alertText(lead, def.label, note);
    let status: LeadStatus = lead.status;
    if (type === "calendar_booked") status = "APPOINTMENT";
    else if (["NEW", "CONTACTED", "LONG_GAME"].includes(lead.status)) status = "ENGAGED";
    Object.assign(data, {
      status,
      lastEngagementAt: now,
      autopilot: false,
      autopilotNote: "They're talking — handed to you",
      needsAgent: true,
      needsAgentReason: def.label,
      snoozedUntil: null,
    });
  } else if (type === "unsubscribe") {
    Object.assign(data, { emailOptOut: true, autopilot: false, autopilotNote: "Unsubscribed — automation stopped" });
    await db.touch.updateMany({ where: { leadId, status: "PENDING" }, data: { status: "SKIPPED" } });
  } else if (type === "sms_stop") {
    Object.assign(data, { smsConsent: false });
    await db.touch.updateMany({ where: { leadId, status: "PENDING", channel: "SMS" }, data: { status: "SKIPPED" } });
  } else if (type === "invalid_phone") {
    await db.touch.updateMany({ where: { leadId, status: "PENDING", channel: "SMS" }, data: { status: "SKIPPED" } });
  } else {
    Object.assign(data, { lastEngagementAt: now });
  }

  await db.lead.update({
    where: { id: leadId },
    data: {
      ...data,
      activities: {
        create: [
          {
            kind: def.strong ? "reply" : "event",
            actor,
            title: def.label,
            body: note,
            scoreDelta: score - lead.score || null,
          },
          ...(def.strong && lead.autopilot
            ? [{ kind: "autopilot", actor: "system", title: "Autopilot paused — they're engaged, over to you" }]
            : []),
        ],
      },
    },
  });

  return { leadId, score, alert, strong: def.strong };
}

export type ContactKind = "call" | "sms" | "email" | "note";

const CONTACT_TITLES: Record<ContactKind, string> = {
  call: "Called",
  sms: "Texted",
  email: "Emailed",
  note: "Note",
};

export async function logContact(userId: string, leadId: string, kind: ContactKind, body: string | null) {
  const lead = await db.lead.findFirstOrThrow({ where: { id: leadId, userId } });
  const now = new Date();
  const isOutreach = kind !== "note";
  await db.lead.update({
    where: { id: leadId },
    data: {
      ...(isOutreach
        ? {
            lastContactAt: now,
            firstResponseAt: lead.firstResponseAt ?? now,
            status: lead.status === "NEW" ? "CONTACTED" : lead.status,
            // A personal touch answers the "needs you" flag.
            needsAgent: false,
            needsAgentReason: null,
          }
        : {}),
      activities: { create: { kind, actor: "agent", title: CONTACT_TITLES[kind], body } },
    },
  });
}

export async function completeTouch(userId: string, touchId: string, by: "agent" | "autopilot", skipped = false) {
  const touch = await db.touch.findFirstOrThrow({
    where: { id: touchId, lead: { userId } },
    include: { lead: true },
  });
  if (touch.status !== "PENDING") return touch;
  const now = new Date();
  const lead = touch.lead;

  await db.touch.update({
    where: { id: touchId },
    data: { status: skipped ? "SKIPPED" : "DONE", completedAt: now, completedBy: by },
  });

  if (skipped) {
    await db.activity.create({ data: { leadId: lead.id, kind: "event", actor: by, title: `Skipped: ${touch.label}` } });
    return touch;
  }

  if (touch.channel === "TASK") {
    await db.lead.update({
      where: { id: lead.id },
      data: {
        status: "LONG_GAME",
        autopilot: false,
        autopilotNote: "Sequence finished — in the Long Game",
        activities: { create: { kind: "status", actor: by, title: "Moved to the Long Game" } },
      },
    });
    return touch;
  }

  await db.lead.update({
    where: { id: lead.id },
    data: {
      lastContactAt: now,
      firstResponseAt: lead.firstResponseAt ?? now,
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      activities: {
        create: {
          kind: touch.channel === "SMS" ? "sms" : "email",
          actor: by,
          title: `${touch.channel === "SMS" ? "Text" : "Email"} sent — ${touch.label}`,
          body: touch.message,
        },
      },
    },
  });
  return touch;
}

// Light housekeeping that runs when the dashboard loads (and from the cron
// route). Applies the "quiet 30 days" signal and finishes old sequences.
export async function runMaintenance(userId: string) {
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const stale = await db.lead.findMany({
    where: {
      userId,
      status: { notIn: ["CLIENT", "CLOSED", "APPOINTMENT"] },
      NOT: { signals: { has: "stale_30" } },
      OR: [
        { lastEngagementAt: { lt: cutoff } },
        { lastEngagementAt: null, createdAt: { lt: cutoff } },
      ],
    },
    take: 200,
  });
  for (const l of stale) {
    const signals = addSignals(l.signals, ["stale_30"]);
    await db.lead.update({
      where: { id: l.id },
      data: {
        signals,
        score: scoreFor(signals),
        activities: { create: { kind: "score", actor: "system", title: "Quiet for 30 days", scoreDelta: scoreFor(signals) - l.score || null } },
      },
    });
  }

  const finished = await db.touch.findMany({
    where: { channel: "TASK", status: "PENDING", dueAt: { lte: new Date() }, lead: { userId, autopilot: true } },
    select: { id: true },
    take: 200,
  });
  for (const t of finished) await completeTouch(userId, t.id, "autopilot");
}
