// Sign-in setup (Auth.js v5).
//
// • Google  — enabled when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set
// • Email   — "magic link" sent through Resend when AUTH_RESEND_KEY is set
// • Dev     — a no-password login for local testing ONLY (DEV_LOGIN=true and
//             never in production)

import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM ?? "Lead Rescue <onboarding@resend.dev>",
    }),
  );
}

export const devLoginEnabled = process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        if (!email) return null;
        return db.user.upsert({ where: { email }, update: {}, create: { email, name: email.split("@")[0] } });
      },
    }),
  );
}

export const enabledProviders = {
  google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  email: !!process.env.AUTH_RESEND_KEY,
  dev: devLoginEnabled,
};

function isAllowed(email?: string | null) {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return !!email && list.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // JWT sessions = no database lookup on every page view, and they work with
  // every provider above (database sessions can't be used with Credentials).
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login", verifyRequest: "/login?check=email", error: "/login" },
  callbacks: {
    signIn({ user }) {
      return isAllowed(user.email);
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  trustHost: true,
});
