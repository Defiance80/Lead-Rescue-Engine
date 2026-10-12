// The intake pipeline. Every lead — from n8n, a webhook, or the "Add lead"
// form — goes through ingestLead(). It follows the playbook:
//
//   normalize → validate → check duplicates → create/merge → score →
//   build follow-up plan → log everything
//
// Anything that can't be cleanly processed lands in the Rescue Queue
// (IntakeIssue) instead of disappearing.

import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { normalizeLead, type NormalizedLead } from "./normalize";
import { addSignals, scoreFor, signalsFromText, SIGNALS, type SignalKey } from "./scoring";
import { buildPlan, reviewFlagFor } from "./messages";
import { addDays } from "./time";
import { agentFirstName } from "./agent";

export type IngestResult =
  | { outcome: "created"; leadId: string; score: number; warnings: string[] }
  | { outcome: "merged"; leadId: string; score: number; warnings: string[] }
  | { outcome: "queued"; issueId: string; reason: string };

type Options = {
  actor?: "n8n" | "agent" | "webhook" | "assistant";
  isSample?: boolean;
  createdAt?: Date;
  trusted?: boolean; // a human already looked at it — skip the spam check
};

function spamReason(n: NormalizedLead): string | null {
  const text = `${n.inquiry ?? ""}`.toLowerCase();
  const links = (text.match(/https?:\/\//g) ?? []).length;
  if (links >= 2) return "Message contains several links";
  if (/\b(seo|backlinks?|crypto|bitcoin|viagra|casino|guest post|web design services|loan offer)\b/.test(text))
    return "Message reads like a sales pitch or spam";
  if (n.firstName && /^(test|asdf|qwerty|xxx|aaa)$/i.test(n.firstName)) return "Name looks like a test entry";
  return null;
}

export async function ingestLead(userId: string, payload: unknown, opts: Options = {}): Promise<IngestResult> {
  const actor = opts.actor ?? "webhook";
  const raw = (payload ?? {}) as Prisma.InputJsonValue;

  if (!payload || typeof payload !== "object") {
    const issue = await db.intakeIssue.create({
      data: { userId, kind: "bad_payload", problem: "The lead arrived empty or unreadable.", payload: raw ?? {} },
    });
    return { outcome: "queued", issueId: issue.id, reason: "bad_payload" };
  }

  const n = normalizeLead(payload);

  // Nobody to contact → can't create a useful lead. Hold it for a human look.
  if (!n.email && !n.phone) {
    const bits = [n.emailRaw && `email "${n.emailRaw}"`, n.phoneRaw && `phone "${n.phoneRaw}"`].filter(Boolean);
    const issue = await db.intakeIssue.create({
      data: {
        userId,
        kind: "unreachable",
        problem: bits.length
          ? `No working contact info — ${bits.join(" and ")} couldn't be verified.`
          : "No email or phone number came through.",
        payload: raw,
      },
    });
    return { outcome: "queued", issueId: issue.id, reason: "unreachable" };
  }

  const spam = opts.trusted ? null : spamReason(n);
  if (spam) {
    const issue = await db.intakeIssue.create({
      data: { userId, kind: "possible_spam", problem: spam, payload: raw },
    });
    return { outcome: "queued", issueId: issue.id, reason: "possible_spam" };
  }

  const warnings: string[] = [];
  if (n.emailRaw && !n.email) warnings.push(`Email "${n.emailRaw}" doesn't look valid`);
  if (n.phoneRaw && !n.phone) warnings.push(`Phone "${n.phoneRaw}" doesn't look valid`);

  // ── Duplicate check ───────────────────────────────────────────────────────
  const or: Prisma.LeadWhereInput[] = [];
  if (n.email) or.push({ email: n.email });
  if (n.phone) or.push({ phone: n.phone });
  const existing = await db.lead.findFirst({ where: { userId, OR: or }, orderBy: { createdAt: "desc" } });

  const textSignals = signalsFromText(n.inquiry);

  if (existing) {
    const signals = addSignals(existing.signals, ["returned", ...textSignals, ...(n.phone ? (["valid_phone"] as SignalKey[]) : [])]);
    const score = scoreFor(signals);
    const gained = score - existing.score;
    await db.lead.update({
      where: { id: existing.id },
      data: {
        // Fill blanks only — never overwrite what we already know.
        lastName: existing.lastName ?? n.lastName,
        email: existing.email ?? n.email,
        phone: existing.phone ?? n.phone,
        property: existing.property ?? n.property,
        mlsNumber: existing.mlsNumber ?? n.mlsNumber,
        city: existing.city ?? n.city,
        priceMin: existing.priceMin ?? n.priceMin,
        priceMax: existing.priceMax ?? n.priceMax,
        timeline: existing.timeline ?? n.timeline,
        financing: existing.financing ?? n.financing,
        signals,
        score,
        lastEngagementAt: new Date(),
        status: existing.status === "LONG_GAME" || existing.status === "CLOSED" ? "ENGAGED" : existing.status,
        activities: {
          create: {
            kind: "merged",
            actor,
            title: `Came back through ${n.source}`,
            body: [n.property && `Asked about ${n.property}`, n.inquiry && `"${n.inquiry}"`].filter(Boolean).join(" — ") || null,
            scoreDelta: gained || null,
          },
        },
      },
    });
    return { outcome: "merged", leadId: existing.id, score, warnings };
  }

  // ── New lead ──────────────────────────────────────────────────────────────
  if (!n.firstName) warnings.push("No name came through");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const agent = {
    name: agentFirstName(user),
    business: user.businessName,
    bookingUrl: user.bookingUrl,
  };

  const signals: SignalKey[] = Array.from(
    new Set<SignalKey>(["inquiry", ...(n.phone ? (["valid_phone"] as SignalKey[]) : []), ...(n.phoneRaw && !n.phone ? (["invalid_phone"] as SignalKey[]) : []), ...textSignals]),
  );
  if (/pre-?approv|cash/i.test(n.financing ?? "")) signals.push("preapproved");
  const score = scoreFor(signals);

  let leadType = n.leadType;
  if (leadType === "UNKNOWN" && (signals.includes("valuation_request") || signals.includes("home_to_sell")))
    leadType = signals.includes("home_to_sell") && n.property ? "BOTH" : "SELLER";
  if (leadType === "UNKNOWN" && (n.property || n.mlsNumber)) leadType = "BUYER";

  const reviewFlag = reviewFlagFor(n.inquiry);
  const created = opts.createdAt ?? new Date();
  const firstName = n.firstName ?? "Friend";
  const plan = buildPlan({ firstName, property: n.property, city: n.city, inquiry: n.inquiry, leadType }, agent);

  const lead = await db.lead.create({
    data: {
      userId,
      firstName,
      lastName: n.lastName,
      email: n.email,
      phone: n.phone,
      source: n.source,
      campaign: n.campaign,
      property: n.property,
      mlsNumber: n.mlsNumber,
      city: n.city,
      priceMin: n.priceMin,
      priceMax: n.priceMax,
      inquiry: n.inquiry,
      landingPage: n.landingPage,
      referral: n.referral,
      timeline: n.timeline,
      financing: n.financing,
      leadType,
      signals,
      score,
      smsConsent: n.smsConsent,
      reviewFlag,
      autopilot: !reviewFlag,
      autopilotNote: reviewFlag ? "Paused for a personal reply" : null,
      needsAgent: score >= 80 || !!reviewFlag,
      needsAgentReason: reviewFlag ?? (score >= 80 ? "Strong buying signals on first contact" : null),
      isSample: opts.isSample ?? false,
      createdAt: created,
      touches: {
        create: plan.map((p) => ({
          day: p.day,
          channel: p.channel,
          label: p.label,
          subject: p.subject,
          message: p.message,
          dueAt: addDays(created, p.day),
          status: p.channel === "SMS" && !n.phone ? "SKIPPED" : p.channel === "EMAIL" && !n.email ? "SKIPPED" : "PENDING",
        })),
      },
      activities: {
        create: [
          {
            kind: "created",
            actor,
            title: `New lead from ${n.source}`,
            body: n.inquiry ? `"${n.inquiry}"` : null,
            scoreDelta: score,
            createdAt: created,
          },
          ...(warnings.length
            ? [{ kind: "note", actor: "system", title: "Heads up on the data", body: warnings.join(" · "), createdAt: created }]
            : []),
          ...(reviewFlag
            ? [{ kind: "autopilot", actor: "system", title: "Autopilot held for a personal reply", body: reviewFlag, createdAt: created }]
            : []),
        ],
      },
    },
  });

  // Record fixable data problems in the queue too, linked to the lead, so
  // they're visible without blocking the lead from being worked.
  if (warnings.length) {
    await db.intakeIssue.create({
      data: {
        userId,
        leadId: lead.id,
        kind: !n.firstName ? "missing_name" : n.emailRaw && !n.email ? "invalid_email" : "invalid_phone",
        problem: warnings.join(" · "),
        payload: raw,
      },
    });
  }

  return { outcome: "created", leadId: lead.id, score, warnings };
}

export function explainSignals(signals: string[]) {
  return Array.from(new Set(signals))
    .filter((s) => s in SIGNALS)
    .map((s) => ({ key: s, ...SIGNALS[s as SignalKey] }))
    .sort((a, b) => b.points - a.points);
}
