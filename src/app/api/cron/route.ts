// Daily housekeeping, triggered by Vercel Cron (see vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMaintenance } from "@/lib/engagement";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const users = await db.user.findMany({ select: { id: true } });
  for (const u of users) await runMaintenance(u.id);
  return NextResponse.json({ ok: true, users: users.length });
}
