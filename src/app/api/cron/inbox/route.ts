// Checks every connected mailbox. Call it every 5 minutes from a scheduler:
//   • Vercel Cron (Pro plan), or
//   • a free service like cron-job.org: GET https://YOUR-APP/api/cron/inbox?key=CRON_SECRET
// Either "Authorization: Bearer CRON_SECRET" or ?key=CRON_SECRET is accepted.

import { NextResponse } from "next/server";
import { syncAllMailboxes } from "@/lib/assistant/process";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key");
  const authed = !!secret && (req.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ ok: false }, { status: 401 });
  const results = await syncAllMailboxes();
  return NextResponse.json({ ok: true, mailboxes: results.length, results });
}
