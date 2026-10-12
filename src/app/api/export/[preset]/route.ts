// Downloads a CSV shaped for the chosen platform, e.g. /api/export/mailchimp?temperature=HOT

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { leadsForExport, presetByKey, toCsv } from "@/lib/export";

export async function GET(req: Request, { params }: { params: Promise<{ preset: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));
  const { preset: key } = await params;
  const preset = presetByKey(key);
  if (!preset) return NextResponse.json({ error: "Unknown export format" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const leads = await leadsForExport(session.user.id, {
    temperature: q.get("temperature") || undefined,
    priority: q.get("priority") || undefined,
    source: q.get("source") || undefined,
    since: q.get("since") || undefined,
    includeClosed: q.get("includeClosed") === "on",
    includeSample: q.get("includeSample") === "on",
  });
  const { csv } = toCsv(preset, leads);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-rescue-${preset.key}-${date}.csv"`,
    },
  });
}
