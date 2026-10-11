// The Autopilot outbox. n8n polls this (e.g. every 5 minutes), sends each
// message through Twilio / Gmail, then POSTs back the result.
//
// GET  → messages that are due right now and safe to send
// POST → { "touchId": "...", "status": "sent" | "failed", "error": "optional" }
//
// Safety rules applied here, not in n8n, so they can't be forgotten:
//   quiet hours · SMS consent · email opt-out · do-not-contact · autopilot paused

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { readJson, unauthorized, userFromToken } from "@/lib/api";
import { completeTouch, recordEvent } from "@/lib/engagement";
import { inQuietHours } from "@/lib/time";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userFromToken(token);
  if (!user) return unauthorized();

  if (inQuietHours(user.timezone, user.quietStart, user.quietEnd)) {
    return NextResponse.json({ ok: true, quietHours: true, messages: [] });
  }

  const touches = await db.touch.findMany({
    where: {
      status: "PENDING",
      channel: { in: ["SMS", "EMAIL"] },
      dueAt: { lte: new Date() },
      lead: { userId: user.id, autopilot: true, doNotContact: false, status: { notIn: ["CLIENT", "CLOSED"] } },
    },
    include: { lead: true },
    orderBy: { dueAt: "asc" },
    take: 50,
  });

  const messages = touches
    .filter((t) =>
      t.channel === "SMS" ? t.lead.smsConsent && !!t.lead.phone : !t.lead.emailOptOut && !!t.lead.email,
    )
    .map((t) => ({
      touchId: t.id,
      leadId: t.leadId,
      channel: t.channel.toLowerCase(),
      to: t.channel === "SMS" ? t.lead.phone : t.lead.email,
      subject: t.subject,
      body: t.message,
      firstName: t.lead.firstName,
      label: t.label,
      day: t.day,
    }));

  return NextResponse.json({ ok: true, quietHours: false, messages });
}

const Result = z.object({
  touchId: z.string(),
  status: z.enum(["sent", "failed"]),
  error: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userFromToken(token);
  if (!user) return unauthorized();

  const parsed = Result.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { touchId, status, error } = parsed.data;

  const touch = await db.touch.findFirst({ where: { id: touchId, lead: { userId: user.id } }, include: { lead: true } });
  if (!touch) return NextResponse.json({ ok: false, error: "Unknown touch" }, { status: 404 });

  if (status === "sent") {
    await completeTouch(user.id, touchId, "autopilot");
    return NextResponse.json({ ok: true });
  }

  // Failed sends go to the Rescue Queue so a human sees them.
  await db.intakeIssue.create({
    data: {
      userId: user.id,
      leadId: touch.leadId,
      kind: "send_failed",
      problem: `${touch.channel === "SMS" ? "Text" : "Email"} to ${touch.lead.firstName} didn't go through${error ? `: ${error}` : ""}`,
      payload: { touchId, channel: touch.channel, error: error ?? null },
    },
  });
  if (touch.channel === "SMS" && /invalid|not a (valid )?(mobile|phone)|unreachable|landline/i.test(error ?? "")) {
    await recordEvent(user.id, touch.leadId, "invalid_phone", error ?? null, "n8n");
  }
  return NextResponse.json({ ok: true, queued: true });
}
