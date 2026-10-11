// Sign-in setup (Auth.js v5).
//
// • Google   — "Continue with Google", enabled when AUTH_GOOGLE_ID /
//              AUTH_GOOGLE_SECRET are set
// • Password — regular email + password accounts (always on). People create
//              an account at /signup. ALLOWED_EMAILS limits who may join.
// • Email link — optional "email me a sign-in link" through Resend when
//              AUTH_RESEND_KEY is set; doubles as "forgot password"
// • Dev      — a no-password login for local testing ONLY (DEV_LOGIN=true and
//              never in production)

import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

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

providers.push(
  Credentials({
    id: "password",
    name: "Email and password",
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    async authorize(creds) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password || !isAllowed(email)) return null;
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
      return user;
    },
  }),
);

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
  emailLink: !!process.env.AUTH_RESEND_KEY,
  dev: devLoginEnabled,
};

export function isAllowed(email?: string | null) {
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
    async signIn({ user, account }) {
      if (!isAllowed(user.email)) return false;
      // Google (or an email link) proves the person owns that inbox. If a
      // password account was created for the same email without that proof,
      // remove its password so whoever made it can't keep a back door.
      if (account && account.provider !== "password" && account.provider !== "dev" && user.email) {
        await db.user.updateMany({
          where: { email: user.email.toLowerCase(), emailVerified: null, NOT: { passwordHash: null } },
          data: { passwordHash: null },
        });
      }
      return true;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // Mark the email as verified once Google or an email link confirms it.
    async signIn({ user, account }) {
      if (account && (account.provider === "google" || account.provider === "resend") && user.email) {
        await db.user.updateMany({ where: { email: user.email.toLowerCase(), emailVerified: null }, data: { emailVerified: new Date() } });
      }
    },
  },
  trustHost: true,
});
