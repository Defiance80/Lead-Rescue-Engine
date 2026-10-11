import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BellRing, Mail, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { auth, enabledProviders } from "@/auth";
import { devSignInAction, emailLinkAction, googleSignInAction, passwordSignInAction } from "../auth-actions";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  CredentialsSignin: "That email and password combination didn't work. Check both and try again.",
  AccessDenied: "That account isn't on the guest list for this workspace.",
  Verification: "That sign-in link expired or was already used. Send a fresh one below.",
  Configuration: "Sign-in isn't fully set up yet. Check the environment variables.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/today");
  const { check, error } = await searchParams;
  const p = enabledProviders;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Story side */}
      <section className="relative hidden overflow-hidden border-r border-white/5 bg-ink-900 p-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-ember-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-3xl" />
        <Logo />
        <div className="relative mt-auto max-w-lg">
          <p className="eyebrow text-ember-400">Your lead safety net</p>
          <h1 className="mt-3 font-display text-5xl font-bold leading-[1.05] tracking-tight text-white">
            Every lead answered.
            <br />
            <span className="bg-gradient-to-r from-ember-400 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">
              Nobody forgotten.
            </span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Leads get a thoughtful hello in minutes, follow-up keeps going on its own, and you step in
            the moment someone is ready.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              { icon: Zap, color: "text-amber-300 bg-amber-400/10", title: "Instant first hello", text: "Personal, property-aware replies while you're busy." },
              { icon: ShieldCheck, color: "text-cyan-300 bg-cyan-400/10", title: "Follow-up that never quits", text: "Day 1, 3, 7, 14 — handled, with quiet hours respected." },
              { icon: BellRing, color: "text-rose-300 bg-rose-400/10", title: "A tap on the shoulder", text: "You hear about it the moment someone is ready to talk." },
            ].map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${f.color}`}>
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold text-white">{f.title}</div>
                  <div className="text-sm text-slate-400">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sign-in side */}
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Welcome back</h2>
          <p className="mt-2 text-slate-400">Sign in to see who&apos;s waiting on you today.</p>

          {!process.env.AUTH_SECRET && (
            <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              <b>Setup needed:</b> sign-in won&apos;t work until <code>AUTH_SECRET</code> is added in Vercel
              (Settings → Environment Variables), followed by a redeploy.
            </div>
          )}
          {check === "email" && (
            <div className="mt-6 flex gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
              <Mail className="h-5 w-5 shrink-0 text-cyan-300" />
              <div>
                <div className="font-semibold">Check your inbox</div>
                A sign-in link is on its way. It works once and expires in 24 hours.
              </div>
            </div>
          )}
          {error && (
            <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              {ERRORS[error] ?? "Something went wrong signing in. Please try again."}
            </div>
          )}

          <div className="mt-8 space-y-4">
            {p.google && (
              <>
                <form action={googleSignInAction}>
                  <button className="btn w-full border border-white/10 bg-white py-3 text-[15px] text-slate-900 hover:bg-slate-100">
                    <GoogleIcon /> Continue with Google
                  </button>
                </form>
                <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
                  <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}

            <form action={passwordSignInAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="pw-email">Email</label>
                <input id="pw-email" name="email" type="email" required autoComplete="email" placeholder="you@yourbrokerage.com" className="input py-3" />
              </div>
              <div>
                <label className="label" htmlFor="pw-password">Password</label>
                <input id="pw-password" name="password" type="password" required autoComplete="current-password" className="input py-3" />
              </div>
              <button className="btn-primary w-full py-3 text-[15px]">Sign in</button>
            </form>

            <p className="text-center text-sm text-slate-400">
              New here?{" "}
              <Link href="/signup" className="font-semibold text-ember-300 hover:text-ember-200">Create an account</Link>
            </p>

            {p.emailLink && (
              <details className="rounded-xl border border-white/[0.06] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-300">Forgot your password? Email me a sign-in link</summary>
                <form action={emailLinkAction} className="mt-3 flex gap-2">
                  <input name="email" type="email" required placeholder="you@yourbrokerage.com" className="input" aria-label="Email for sign-in link" />
                  <button className="btn-secondary shrink-0"><Mail className="h-4 w-4" /> Send</button>
                </form>
              </details>
            )}

            {p.dev && (
              <form action={devSignInAction} className="space-y-3 rounded-xl border border-dashed border-amber-400/30 p-4">
                <div className="eyebrow text-amber-300">Local dev login</div>
                <input name="email" type="email" required defaultValue="ian@example.com" className="input" />
                <button className="btn-secondary w-full">Sign in (dev only)</button>
              </form>
            )}
          </div>

          <p className="mt-10 text-xs leading-relaxed text-slate-500">
            By signing in you agree to use automated messaging only with leads who have opted in.
          </p>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
