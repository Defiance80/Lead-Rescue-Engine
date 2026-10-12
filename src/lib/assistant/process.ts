// The Inbox Assistant's routine, run every few minutes (and on "Check now"):
//
//   1. read new primary emails            4. notice replies the agent sent personally
//   2. sort + extract + draft (AI)        5. when the "Cover me" timer runs out:
//   3. move leads into the pipeline          send the reply (Auto) or hold it for one tap (Approve)

import type { InboxItem, MailAccount, Prisma, Temperature, User } from "@prisma/client";
import { db } from "../db";
import { agentFirstName } from "../agent";
import { ingestLead } from "../intake";
import { logContact, recordEvent } from "../engagement";
import { inQuietHours } from "../time";
import { analyzeEmail, type AgentInfo, type AnalysisResult } from "./analyze";
import { fetchNew, friendlyMailError, sendReply, type IncomingEmail, type SentRef } from "../mail/imap";

const MAX_PER_RUN = 15; // keeps each run well inside serverless time limits
const LOOKBACK_DAYS = 2; // how far back the very first check looks
const REPLYABLE = new Set(["new_lead", "client", "other"]);

const TEMP: Record<AnalysisResult["temperature"], Temperature> = { hot: "HOT", warm: "WARM", cold: "COLD" };
const PRIO: Record<AnalysisResult["priority"], number> = { high: 1, medium: 2, low: 3 };
const TYPE: Partial<Record<AnalysisResult["intent"], string>> = { buy: "buyer", sell: "seller", buy_and_sell: "both" };

export function agentInfo(user: User, acc: MailAccount): AgentInfo {
  return {
    name: agentFirstName(user),
    business: user.businessName,
    signAs: acc.signAs === "assistant" ? "assistant" : "agent",
    assistantName: acc.assistantName,
  };
}

// The text actually sent: draft + booking link + signature.
export function composeBody(draft: string, user: User, acc: MailAccount) {
  const name = agentFirstName(user);
  const fullName = user.displayName || user.name || name;
  const parts = [draft.trim()];
  if (user.bookingUrl) parts.push(`If it's easier, you can grab a time that works for you here:\n${user.bookingUrl}`);
  const sig =
    acc.signAs === "assistant"
      ? `${acc.assistantName || "Assistant"} for ${fullName}`
      : fullName;
  parts.push([sig, user.businessName].filter(Boolean).join("\n"));
  return parts.join("\n\n");
}

export function fromNameFor(user: User, acc: MailAccount) {
  const fullName = user.displayName || user.name || agentFirstName(user);
  return acc.signAs === "assistant" ? `${acc.assistantName || "Assistant"} for ${fullName}` : fullName;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// ── 1–3: read, sort, and route new emails ───────────────────────────────────

export async function ingestEmails(user: User, acc: MailAccount, emails: IncomingEmail[]) {
  const known = new Set(
    (
      await db.inboxItem.findMany({
        where: { userId: user.id, messageId: { in: emails.map((e) => e.messageId) } },
        select: { messageId: true },
      })
    ).map((x) => x.messageId),
  );
  const fresh = emails.filter((e) => !known.has(e.messageId));
  const agent = agentInfo(user, acc);

  await pool(fresh, 4, async (e) => {
    const base = {
      userId: user.id,
      messageId: e.messageId,
      references: e.references,
      fromName: e.fromName,
      fromEmail: e.fromEmail,
      subject: e.subject.slice(0, 300),
      snippet: e.text.replace(/\s+/g, " ").slice(0, 220),
      bodyText: e.text,
      receivedAt: e.date,
      autoAllowed: e.date >= acc.createdAt,
    };

    // Newsletters, receipts and no-reply senders: file them, no AI needed.
    if (e.automated) {
      await db.inboxItem.create({ data: { ...base, category: "newsletter_promo", status: "done", priority: 3, temperature: "COLD", summary: e.subject.slice(0, 140) } });
      return;
    }

    const a = await analyzeEmail({ fromName: e.fromName, fromEmail: e.fromEmail, subject: e.subject, text: e.text, receivedAt: e.date }, agent);
    const risky = a.risk !== "none";
    const wantsReply = a.needs_reply && REPLYABLE.has(a.category);
    const status = risky ? "held" : wantsReply ? "waiting" : "done";

    // Route into the pipeline.
    let leadId: string | null = null;
    const existing = await db.lead.findFirst({ where: { userId: user.id, email: e.fromEmail }, orderBy: { createdAt: "desc" } });
    if (existing) {
      leadId = existing.id;
      if (REPLYABLE.has(a.category)) await recordEvent(user.id, existing.id, "reply_email", a.summary, "assistant");
    } else if (a.category === "new_lead") {
      const c = a.contact;
      const res = await ingestLead(
        user.id,
        {
          first_name: c.first_name ?? e.fromName?.split(" ")[0],
          last_name: c.last_name ?? (e.fromName?.split(" ").slice(1).join(" ") || undefined),
          email: c.email ?? e.fromEmail,
          phone: c.phone ?? undefined,
          property: c.property_address ?? undefined,
          city: c.city ?? undefined,
          price_min: c.budget_min ?? undefined,
          price_max: c.budget_max ?? undefined,
          timeline: c.timeline ?? undefined,
          financing: c.financing ?? undefined,
          lead_type: TYPE[a.intent],
          source: "Email",
          message: `${e.subject}\n\n${e.text}`.slice(0, 1500),
        },
        { actor: "assistant", trusted: true, createdAt: e.date },
      );
      if (res.outcome !== "queued") {
        leadId = res.leadId;
        if (res.outcome === "created") {
          // The reply happens in the email thread, so skip the separate Day 0 email.
          await db.touch.updateMany({ where: { leadId, day: 0, channel: "EMAIL", status: "PENDING" }, data: { status: "SKIPPED" } });
          await db.lead.update({
            where: { id: leadId },
            data: {
              priority: PRIO[a.priority],
              ...(risky ? { needsAgent: true, needsAgentReason: riskReason(a.risk), autopilot: false, autopilotNote: "Held for a personal reply" } : {}),
              activities: { create: { kind: "email", actor: "assistant", title: "Arrived by email — first reply handled in the email thread", body: a.summary } },
            },
          });
        }
      }
    }

    await db.inboxItem.create({
      data: {
        ...base,
        category: a.category,
        intent: a.intent,
        temperature: TEMP[a.temperature],
        priority: risky ? 1 : PRIO[a.priority],
        summary: a.summary.slice(0, 200),
        extracted: a.contact as Prisma.InputJsonValue,
        needsReply: wantsReply,
        riskFlag: risky ? a.risk : null,
        aiUsed: a.aiUsed,
        status,
        assistantDueAt: status === "waiting" ? new Date(e.date.getTime() + acc.replyWindowMins * 60000) : null,
        draftSubject: a.reply_subject.slice(0, 300),
        draftBody: a.reply_body,
        leadId,
      },
    });
  });
  return fresh.length;
}

export function riskReason(risk: string) {
  return (
    {
      wire_fraud: "Mentions wire or payment instructions — verify by phone before anything else",
      sensitive: "Touches a Fair Housing–sensitive topic — worth a personal reply",
      complaint_or_legal: "Sounds like a complaint or legal matter — handle personally",
      personal_matter: "Personal matter — handle personally",
    }[risk] ?? "Needs a personal reply"
  );
}

// ── 4: did the agent already reply? ─────────────────────────────────────────

export async function markPersonalReplies(userId: string, sent: SentRef[]) {
  if (!sent.length) return 0;
  const open = await db.inboxItem.findMany({ where: { userId, status: { in: ["waiting", "ready", "held"] } } });
  let n = 0;
  for (const item of open) {
    const replied = sent.some(
      (s) => s.inReplyTo === item.messageId || (s.to.includes(item.fromEmail) && s.date > item.receivedAt),
    );
    if (!replied) continue;
    n++;
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "you_replied", repliedAt: new Date() } });
    if (item.leadId) await logContact(userId, item.leadId, "email", `Replied by email — "${item.subject}"`);
  }
  return n;
}

// ── 5: the "Cover me" timer ─────────────────────────────────────────────────

export async function sendItem(user: User, acc: MailAccount, item: InboxItem, edits?: { subject?: string; body?: string }) {
  const subject = edits?.subject?.trim() || item.draftSubject || `Re: ${item.subject}`;
  const draft = edits?.body?.trim() || item.draftBody || "";
  try {
    await sendReply(acc, {
      to: item.fromEmail,
      toName: item.fromName,
      fromName: fromNameFor(user, acc),
      subject,
      text: composeBody(draft, user, acc),
      inReplyTo: item.messageId,
      references: item.references,
    });
  } catch (err) {
    const msg = friendlyMailError(err);
    await db.inboxItem.update({ where: { id: item.id }, data: { sendError: msg } });
    await db.intakeIssue.create({
      data: { userId: user.id, leadId: item.leadId, kind: "send_failed", problem: `Assistant email to ${item.fromName || item.fromEmail} didn't send: ${msg}`, payload: { inboxItemId: item.id } },
    });
    return false;
  }
  await db.inboxItem.update({
    where: { id: item.id },
    data: { status: "sent", sentAt: new Date(), sendError: null, draftSubject: subject, draftBody: draft },
  });
  if (item.leadId) await logContact(user.id, item.leadId, "email", `Inbox Assistant replied: "${subject}"`);
  return true;
}

export async function processDue(user: User, acc: MailAccount) {
  const due = await db.inboxItem.findMany({
    where: { userId: user.id, status: "waiting", assistantDueAt: { lte: new Date() } },
    orderBy: { assistantDueAt: "asc" },
    take: 10,
  });
  const quiet = inQuietHours(user.timezone, user.quietStart, user.quietEnd);
  let sent = 0;
  let ready = 0;
  for (const item of due) {
    const canAuto = acc.mode === "auto" && item.autoAllowed && !item.riskFlag && REPLYABLE.has(item.category);
    if (canAuto) {
      if (quiet) continue; // hold until morning
      if (await sendItem(user, acc, item)) sent++;
      continue;
    }
    await db.inboxItem.update({ where: { id: item.id }, data: { status: "ready" } });
    ready++;
  }
  return { sent, ready };
}

// ── The whole routine for one mailbox ───────────────────────────────────────

export async function syncMailbox(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { mailbox: true } });
  const acc = user.mailbox;
  if (!acc || !acc.enabled) return { ok: false as const, error: "No mailbox connected" };

  try {
    const oldestOpen = await db.inboxItem.findFirst({
      where: { userId, status: { in: ["waiting", "ready", "held"] } },
      orderBy: { receivedAt: "asc" },
      select: { receivedAt: true },
    });
    const { emails, uidValidity, lastUid, sent } = await fetchNew(acc, {
      maxMessages: MAX_PER_RUN,
      lookbackDays: LOOKBACK_DAYS,
      sentSince: oldestOpen?.receivedAt ?? new Date(Date.now() - LOOKBACK_DAYS * 86400000),
    });
    const added = await ingestEmails(user, acc, emails);
    await db.mailAccount.update({ where: { id: acc.id }, data: { uidValidity, lastUid, lastSyncAt: new Date(), lastError: null } });
    const replied = await markPersonalReplies(userId, sent);
    const { sent: autoSent, ready } = await processDue(user, { ...acc, uidValidity, lastUid });
    return { ok: true as const, added, replied, autoSent, ready };
  } catch (err) {
    const error = friendlyMailError(err);
    await db.mailAccount.update({ where: { id: acc.id }, data: { lastError: error, lastSyncAt: new Date() } });
    return { ok: false as const, error };
  }
}

export async function syncAllMailboxes(budgetMs = 45_000) {
  const started = Date.now();
  const accounts = await db.mailAccount.findMany({ where: { enabled: true }, orderBy: { lastSyncAt: "asc" }, select: { userId: true } });
  const results: { userId: string; ok: boolean }[] = [];
  for (const a of accounts) {
    if (Date.now() - started > budgetMs) break;
    const r = await syncMailbox(a.userId);
    results.push({ userId: a.userId, ok: r.ok });
  }
  return results;
}
