// POST a lead here from n8n, a website form, Zapier, etc.
// Any reasonable field names work — see src/lib/normalize.ts.

import { NextResponse } from "next/server";
import { ingestLead } from "@/lib/intake";
import { readJson, unauthorized, userFromToken } from "@/lib/api";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userFromToken(token);
  if (!user) return unauthorized();

  const body = await readJson(req);
  try {
    const result = await ingestLead(user.id, body, { actor: "n8n" });
    const lead = "leadId" in result ? await db.lead.findUnique({ where: { id: result.leadId } }) : null;
    return NextResponse.json({
      ok: true,
      ...result,
      needsAgent: lead?.needsAgent ?? false,
    });
  } catch (err) {
    // Even an unexpected crash leaves a trace in the Rescue Queue.
    await db.intakeIssue.create({
      data: {
        userId: user.id,
        kind: "bad_payload",
        problem: `Couldn't process this lead: ${(err as Error).message}`.slice(0, 500),
        payload: (body ?? {}) as object,
      },
    });
    return NextResponse.json({ ok: false, outcome: "queued", error: "Saved to Rescue Queue" }, { status: 202 });
  }
}
