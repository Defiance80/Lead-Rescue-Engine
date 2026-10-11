"use server";

// Server Actions: functions the UI calls directly (buttons, forms).
// They run on the server, so they can talk to the database safely.
// Every action re-checks who's signed in and only touches that user's data.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LeadStatus, LeadType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ingestLead } from "@/lib/intake";
import { completeTouch, logContact, recordEvent, type ContactKind, type EventType } from "@/lib/engagement";
import { clearSampleData, loadSampleData } from "@/lib/sample";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { addDays } from "@/lib/time";
import { signOut } from "@/auth";

const refresh = () => revalidatePath("/", "layout");

async function ownLead(leadId: string) {
  const user = await requireUser();
  const lead = await db.lead.findFirst({ where: { id: leadId, userId: user.id } });
  if (!lead) throw new Error("Lead not found");
  return { user, lead };
}

export async function logContactAction(leadId: string, kind: ContactKind, body?: string) {
  const user = await requireUser();
  await logContact(user.id, leadId, kind, body?.trim() || null);
  refresh();
}

export async function addNoteAction(formData: FormData) {
  const leadId = String(formData.get("leadId"));
  const kind = String(formData.get("kind") || "note") as ContactKind;
  const body = String(formData.get("body") ?? "");
  if (!body.trim() && kind === "note") return;
  await logContactAction(leadId, kind, body);
}

export async function markTouchAction(touchId: string, skipped = false) {
  const user = await requireUser();
  await completeTouch(user.id, touchId, "agent", skipped);
  refresh();
}

export async function recordEventAction(leadId: string, type: EventType, note?: string) {
  const user = await requireUser();
  await recordEvent(user.id, leadId, type, note ?? null, "agent");
  refresh();
}

export async function snoozeAction(leadId: string, days: number) {
  await ownLead(leadId);
  await db.lead.update({
    where: { id: leadId },
    data: {
      snoozedUntil: addDays(new Date(), days),
      activities: { create: { kind: "status", actor: "agent", title: `Set aside for ${days === 1 ? "a day" : `${days} days`}` } },
    },
  });
  refresh();
}

export async function setAutopilotAction(leadId: string, on: boolean) {
  const { lead } = await ownLead(leadId);
  await db.lead.update({
    where: { id: leadId },
    data: {
      autopilot: on,
      autopilotNote: on ? null : "Paused by you",
      reviewFlag: on ? null : lead.reviewFlag,
      activities: { create: { kind: "autopilot", actor: "agent", title: on ? "Autopilot resumed" : "Autopilot paused" } },
    },
  });
  refresh();
}

export async function handledAction(leadId: string) {
  await ownLead(leadId);
  await db.lead.update({
    where: { id: leadId },
    data: {
      needsAgent: false,
      needsAgentReason: null,
      activities: { create: { kind: "status", actor: "agent", title: "Marked as handled" } },
    },
  });
  refresh();
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Reached out",
  ENGAGED: "In conversation",
  APPOINTMENT: "Appointment set",
  CLIENT: "Client",
  LONG_GAME: "Long Game",
  CLOSED: "Not moving forward",
};

export async function setStatusAction(leadId: string, status: LeadStatus) {
  await ownLead(leadId);
  const stop = status === "CLIENT" || status === "CLOSED" || status === "APPOINTMENT";
  await db.lead.update({
    where: { id: leadId },
    data: {
      status,
      ...(stop ? { autopilot: false, autopilotNote: `Stopped — ${STATUS_LABEL[status].toLowerCase()}` } : {}),
      ...(status === "CLIENT" || status === "CLOSED" ? { needsAgent: false, needsAgentReason: null } : {}),
      activities: { create: { kind: "status", actor: "agent", title: `Status → ${STATUS_LABEL[status]}` } },
    },
  });
  refresh();
}

export async function doNotContactAction(leadId: string) {
  await ownLead(leadId);
  await db.lead.update({
    where: { id: leadId },
    data: {
      doNotContact: true,
      autopilot: false,
      autopilotNote: "Do not contact",
      needsAgent: false,
      activities: { create: { kind: "status", actor: "agent", title: "Marked do-not-contact — all messaging stopped" } },
    },
  });
  await db.touch.updateMany({ where: { leadId, status: "PENDING" }, data: { status: "SKIPPED" } });
  refresh();
}

export async function deleteLeadAction(leadId: string) {
  await ownLead(leadId);
  await db.lead.delete({ where: { id: leadId } });
  refresh();
  redirect("/leads");
}

const int = (v: FormDataEntryValue | null) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function updateLeadAction(formData: FormData) {
  const leadId = String(formData.get("leadId"));
  await ownLead(leadId);
  const emailIn = str(formData.get("email"));
  const phoneIn = str(formData.get("phone"));
  await db.lead.update({
    where: { id: leadId },
    data: {
      firstName: str(formData.get("firstName")) ?? "Friend",
      lastName: str(formData.get("lastName")),
      email: emailIn ? normalizeEmail(emailIn) : null,
      phone: phoneIn ? normalizePhone(phoneIn) : null,
      property: str(formData.get("property")),
      city: str(formData.get("city")),
      priceMin: int(formData.get("priceMin")),
      priceMax: int(formData.get("priceMax")),
      timeline: str(formData.get("timeline")),
      financing: str(formData.get("financing")),
      leadType: (str(formData.get("leadType")) ?? "UNKNOWN") as LeadType,
      activities: { create: { kind: "note", actor: "agent", title: "Details updated" } },
    },
  });
  refresh();
}

export async function addLeadAction(formData: FormData) {
  const user = await requireUser();
  const payload = Object.fromEntries(
    Array.from(formData.entries())
      .map(([k, v]) => [k, String(v).trim()])
      .filter(([, v]) => v !== ""),
  );
  const result = await ingestLead(user.id, payload, { actor: "agent" });
  refresh();
  if (result.outcome === "queued") redirect(`/rescue?added=${result.issueId}`);
  redirect(`/leads/${result.leadId}?${result.outcome === "merged" ? "merged=1" : "new=1"}`);
}

// ── Rescue Queue ────────────────────────────────────────────────────────────

export async function dismissIssueAction(issueId: string) {
  const user = await requireUser();
  await db.intakeIssue.updateMany({ where: { id: issueId, userId: user.id }, data: { status: "DISMISSED" } });
  refresh();
}

export async function resolveIssueAction(issueId: string) {
  const user = await requireUser();
  await db.intakeIssue.updateMany({ where: { id: issueId, userId: user.id }, data: { status: "RESOLVED" } });
  refresh();
}

// "Rescue it": take a held lead, apply the agent's corrections, and run it
// through intake again.
export async function rescueIssueAction(formData: FormData) {
  const user = await requireUser();
  const issueId = String(formData.get("issueId"));
  const issue = await db.intakeIssue.findFirst({ where: { id: issueId, userId: user.id } });
  if (!issue) return;
  const name = str(formData.get("name"));
  const fixes: Record<string, string> = {};
  if (name) {
    const [first, ...rest] = name.split(/\s+/);
    fixes.first_name = first;
    if (rest.length) fixes.last_name = rest.join(" ");
  }
  for (const k of ["email", "phone", "inquiry"]) {
    const v = str(formData.get(k));
    if (v) fixes[k] = v;
  }
  const original = (issue.payload && typeof issue.payload === "object" ? issue.payload : {}) as Record<string, unknown>;
  // The normalizer keeps the FIRST value it sees for a field, so nesting the
  // corrections first guarantees they win over the original values.
  const merged = { _corrections: fixes, ...original };
  const result = await ingestLead(user.id, merged, { actor: "agent", trusted: true });
  if (result.outcome === "queued") {
    // Still not usable — remove the new duplicate issue and keep the original open.
    await db.intakeIssue.delete({ where: { id: result.issueId } });
    refresh();
    redirect(`/rescue?stillStuck=${issueId}`);
  }
  await db.intakeIssue.update({ where: { id: issueId }, data: { status: "RESOLVED", leadId: result.leadId } });
  refresh();
  redirect(`/leads/${result.leadId}?rescued=1`);
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();
  const hour = (v: FormDataEntryValue | null, d: number) => {
    const n = int(v);
    return n === null ? d : Math.max(0, Math.min(23, n));
  };
  await db.user.update({
    where: { id: user.id },
    data: {
      displayName: str(formData.get("displayName")),
      businessName: str(formData.get("businessName")),
      phone: str(formData.get("phone")),
      timezone: str(formData.get("timezone")) ?? user.timezone,
      quietStart: hour(formData.get("quietStart"), user.quietStart),
      quietEnd: hour(formData.get("quietEnd"), user.quietEnd),
      onboarded: true,
    },
  });
  refresh();
  redirect("/settings?saved=1");
}

export async function regenerateTokenAction() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { intakeToken: randomBytes(24).toString("base64url") } });
  refresh();
}

export async function loadSampleAction() {
  const user = await requireUser();
  await clearSampleData(user.id);
  await loadSampleData(user.id);
  refresh();
  redirect("/today");
}

export async function clearSampleAction() {
  const user = await requireUser();
  await clearSampleData(user.id);
  refresh();
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
