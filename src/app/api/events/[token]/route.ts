// POST engagement events here: replies, showings, clicks, unsubscribes…
// Body: { "type": "reply_text", "email" | "phone" | "leadId": "...", "note": "optional" }
// Returns an "alert" sentence you can forward to Slack / SMS for the agent.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { readJson, unauthorized, userFromToken } from "@/lib/api";
import { EVENT_TYPES, recordEvent, type EventType } from "@/lib/engagement";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";

const Body = z.object({
  type: z.enum(Object.keys(EVENT_TYPES) as [EventType, ...EventType[]]),
  leadId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userFromToken(token);
  if (!user) return unauthorized();

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid event", validTypes: Object.keys(EVENT_TYPES), details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { type, leadId, email, phone, note } = parsed.data;

  const or = [
    leadId ? { id: leadId } : null,
    normalizeEmail(email ?? null) ? { email: normalizeEmail(email ?? null)! } : null,
    normalizePhone(phone ?? null) ? { phone: normalizePhone(phone ?? null)! } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const lead = or.length
    ? await db.lead.findFirst({ where: { userId: user.id, OR: or }, orderBy: { createdAt: "desc" } })
    : null;
  if (!lead) return NextResponse.json({ ok: false, error: "No matching lead" }, { status: 404 });

  const result = await recordEvent(user.id, lead.id, type, note ?? null, "n8n");
  return NextResponse.json({ ok: true, ...result });
}
