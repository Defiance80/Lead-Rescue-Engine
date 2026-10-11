"use server";

// Server Actions for signing in, creating an account, and changing a password.

import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { isAllowed, signIn } from "@/auth";
import { db } from "@/lib/db";
import { hashPassword, MIN_PASSWORD, verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/normalize";
import { requireUser } from "@/lib/session";

// A failed sign-in throws an AuthError. Turn it into a friendly message on the
// page instead of a crash screen. Anything else — including Next.js's own
// redirect after a successful sign-in — passes straight through.
async function safeSignIn(back: string, ...args: Parameters<typeof signIn>) {
  try {
    await signIn(...args);
  } catch (err) {
    if (err instanceof AuthError) {
      const code = err instanceof CredentialsSignin && err.code !== "credentials" ? `&code=${err.code}` : "";
      redirect(`${back}?error=${err.type}${code}`);
    }
    throw err;
  }
}

export async function googleSignInAction() {
  await safeSignIn("/login", "google", { redirectTo: "/today" });
}

export async function passwordSignInAction(formData: FormData) {
  await safeSignIn("/login", "password", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/today",
  });
}

export async function emailLinkAction(formData: FormData) {
  await safeSignIn("/login", "resend", { email: formData.get("email"), redirectTo: "/today" });
}

export async function devSignInAction(formData: FormData) {
  await safeSignIn("/login", "dev", { email: formData.get("email"), redirectTo: "/today" });
}

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fail = (code: string) => redirect(`/signup?error=${code}${email ? `&email=${encodeURIComponent(email)}` : ""}`);
  if (!email) fail("email");
  if (password.length < MIN_PASSWORD) fail("short");
  if (password !== confirm) fail("mismatch");
  if (!isAllowed(email)) fail("notallowed");

  const existing = await db.user.findUnique({
    where: { email: email! },
    include: { _count: { select: { accounts: true, leads: true } } },
  });
  if (existing?.passwordHash) fail("exists");

  // A leftover record with no password, no Google link and no leads (e.g. from
  // an earlier failed sign-in) holds nothing — let this sign-up claim it.
  if (existing && existing._count.accounts === 0 && existing._count.leads === 0 && !existing.emailVerified) {
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), name: existing.name ?? (name || null), displayName: existing.displayName ?? (name.split(" ")[0] || null) },
    });
    await safeSignIn("/signup", "password", { email, password, redirectTo: "/today" });
    return;
  }
  // An account made through Google is already verified; don't let someone
  // attach a password to it without being signed in.
  if (existing) fail("google");

  await db.user.create({
    data: { email: email!, name: name || null, displayName: name.split(" ")[0] || null, passwordHash: await hashPassword(password) },
  });
  await safeSignIn("/signup", "password", { email, password, redirectTo: "/today" });
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (code: string) => redirect(`/settings?pw=${code}#password`);

  // People who only use Google have no current password, so they can set one directly.
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) back("wrong");
  if (next.length < MIN_PASSWORD) back("short");
  if (next !== confirm) back("mismatch");

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  back("saved");
}
