import { NextResponse } from "next/server";
import { db } from "./db";

// Webhook URLs carry the agent's secret intake token: /api/intake/<token>.
export async function userFromToken(token: string | undefined) {
  if (!token || token.length < 20) return null;
  return db.user.findUnique({ where: { intakeToken: token } });
}

export const unauthorized = () =>
  NextResponse.json({ ok: false, error: "Unknown intake token" }, { status: 401 });

export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData();
    return Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
  }
  try {
    return await req.json();
  } catch {
    return null;
  }
}
