// Read-only queries used by the pages. Keeping them here keeps pages tidy.

import type { Lead, Prisma, Touch } from "@prisma/client";
import { db } from "./db";
import { TIERS } from "./tiers";
import { startOfToday } from "./time";

export const ACTIVE: Prisma.LeadWhereInput = {
  status: { notIn: ["CLIENT", "CLOSED"] },
  doNotContact: false,
};

const notSnoozed = (now: Date): Prisma.LeadWhereInput => ({
  OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
});

// "Priority Lane": who deserves attention, in order.
// 1) asked for you personally  2) highest score  3) waiting longest
export async function priorityLane(userId: string, take = 50) {
  const now = new Date();
  const leads = await db.lead.findMany({
    where: {
      userId,
      ...ACTIVE,
      AND: [
        notSnoozed(now),
        {
          OR: [
            { needsAgent: true },
            { score: { gte: 60 } },
            { status: "NEW", firstResponseAt: null },
            { touches: { some: { status: "PENDING", dueAt: { lte: now }, channel: { not: "TASK" } } } },
          ],
        },
      ],
    },
    include: { touches: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" }, take: 1 } },
    take: 200,
  });
  return leads
    .map((l) => ({ lead: l, priority: priorityOf(l, l.touches[0], now) }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, take)
    .map((x) => x.lead);
}

function priorityOf(l: Lead, next: Touch | undefined, now: Date) {
  let p = l.score;
  if (l.needsAgent) p += 120;
  if (!l.firstResponseAt) p += 40 + Math.min(40, (now.getTime() - l.createdAt.getTime()) / 60000 / 5);
  if (next && next.dueAt <= now) p += 20;
  return p;
}

export type NextMove = {
  lead: Lead & { touches: Touch[] };
  headline: string;
  why: string;
  action: string;
};

export function nextMoveFor(l: Lead & { touches: Touch[] }): NextMove {
  const name = l.firstName;
  if (l.reviewFlag && l.needsAgent)
    return { lead: l, headline: `Send ${name} a personal reply`, why: l.reviewFlag, action: "Open conversation" };
  if (l.needsAgent && l.needsAgentReason)
    return { lead: l, headline: `Call ${name} while they're engaged`, why: `${l.needsAgentReason}.`, action: "Call now" };
  if (!l.firstResponseAt)
    return { lead: l, headline: `Say hello to ${name}`, why: "Fast first replies win the most conversations.", action: "Send first hello" };
  const t = l.touches[0];
  if (t) return { lead: l, headline: `${t.label} for ${name}`, why: "Their follow-up is ready to go.", action: "Send it" };
  return { lead: l, headline: `Check in with ${name}`, why: "Strong signals — keep the momentum.", action: "Open" };
}

// "Safety Net": leads that could slip through the cracks without a nudge.
export async function safetyNet(userId: string) {
  const now = new Date();
  const fiveMin = new Date(now.getTime() - 5 * 60000);
  const oneDay = new Date(now.getTime() - 86400000);
  const base = { userId, ...ACTIVE, ...notSnoozed(now) };
  const include = { touches: { where: { status: "PENDING" as const }, orderBy: { dueAt: "asc" as const }, take: 1 } };

  const [awaitingHello, overdue, askedForYou] = await Promise.all([
    db.lead.findMany({
      where: { ...base, firstResponseAt: null, createdAt: { lt: fiveMin } },
      orderBy: { createdAt: "asc" },
      include,
      take: 50,
    }),
    db.lead.findMany({
      where: {
        ...base,
        NOT: { firstResponseAt: null },
        touches: { some: { status: "PENDING", channel: { not: "TASK" }, dueAt: { lt: new Date(now.getTime() - 3600000) } } },
      },
      orderBy: { score: "desc" },
      include,
      take: 50,
    }),
    db.lead.findMany({
      where: {
        ...base,
        needsAgent: true,
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: oneDay } }],
      },
      orderBy: { score: "desc" },
      include,
      take: 50,
    }),
  ]);
  return { awaitingHello, overdue, askedForYou };
}

export async function safetyNetCount(userId: string) {
  const s = await safetyNet(userId);
  return new Set([...s.awaitingHello, ...s.overdue, ...s.askedForYou].map((l) => l.id)).size;
}

export async function openIssueCount(userId: string) {
  return db.intakeIssue.count({ where: { userId, status: "OPEN" } });
}

export async function dashboardStats(userId: string, timezone: string) {
  const now = new Date();
  const today = startOfToday(timezone, now);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  const [newToday, newWeek, responded, active, dueToday, doneToday, sources, rescued] = await Promise.all([
    db.lead.count({ where: { userId, createdAt: { gte: today } } }),
    db.lead.count({ where: { userId, createdAt: { gte: weekAgo } } }),
    db.lead.findMany({
      where: { userId, createdAt: { gte: monthAgo }, NOT: { firstResponseAt: null } },
      select: { createdAt: true, firstResponseAt: true },
    }),
    db.lead.findMany({ where: { userId, ...ACTIVE }, select: { score: true } }),
    db.touch.count({
      where: { lead: { userId, ...ACTIVE }, channel: { not: "TASK" }, status: "PENDING", dueAt: { lte: now } },
    }),
    db.touch.count({ where: { lead: { userId }, status: "DONE", completedAt: { gte: today } } }),
    db.lead.groupBy({ by: ["source"], where: { userId, createdAt: { gte: monthAgo } }, _count: true }),
    rescuedCount(userId, weekAgo),
  ]);

  const times = responded.map((r) => r.firstResponseAt!.getTime() - r.createdAt.getTime()).sort((a, b) => a - b);
  const medianResponse = times.length ? times[Math.floor(times.length / 2)] : null;

  const tiers = TIERS.map((t, i) => ({
    ...t,
    count: active.filter((a) => a.score >= t.min && (i === 0 || a.score < TIERS[i - 1].min)).length,
  }));

  return {
    newToday,
    newWeek,
    medianResponse,
    dueToday,
    doneToday,
    tiers,
    activeTotal: active.length,
    sources: sources.map((s) => ({ source: s.source, count: s._count })).sort((a, b) => b.count - a.count),
    rescued,
  };
}

// A "rescued" lead went quiet after our first outreach, and then re-engaged
// because follow-up kept going (they replied after Day 1 or later).
export async function rescuedCount(userId: string, since: Date) {
  const replies = await db.activity.findMany({
    where: { lead: { userId }, kind: "reply", createdAt: { gte: since } },
    select: { leadId: true, lead: { select: { touches: { where: { status: "DONE", day: { gte: 1 } }, select: { id: true }, take: 1 } } } },
  });
  return new Set(replies.filter((r) => r.lead.touches.length > 0).map((r) => r.leadId)).size;
}

export async function upcomingTouches(userId: string, take = 6) {
  return db.touch.findMany({
    where: { lead: { userId, ...ACTIVE, autopilot: true }, status: "PENDING", dueAt: { gt: new Date() } },
    orderBy: { dueAt: "asc" },
    include: { lead: true },
    take,
  });
}
