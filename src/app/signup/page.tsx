import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledProviders } from "@/auth";
import { Logo } from "@/components/logo";
import { MIN_PASSWORD } from "@/lib/password";
import { googleSignInAction, signUpAction } from "../auth-actions";

export const metadata: Metadata = { title: "Create your account" };

const ERRORS: Record<string, string> = {
  email: "That email address doesn't look right.",
  short: `Passwords need at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords didn't match. Try typing them again.",
  notallowed: "That email isn't on the list for this workspace. Ask the owner to add it.",
  exists: "You already have an account with that email — sign in instead.",
  google: "That email signs in with Google. Use “Continue with Google” on the sign-in page.",
  CredentialsSignin: "Your account was created, but signing in failed. Try signing in.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/today");
  const { error, email } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-ember-500/15 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-10"><Logo /></div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Create your account</h1>
        <p className="mt-2 text-slate-400">Takes a minute. Then every lead has a safety net.</p>

        {!process.env.AUTH_SECRET && (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <b>Setup needed:</b> sign-in won&apos;t work until <code>AUTH_SECRET</code> is added in Vercel
            (Settings → Environment Variables), followed by a redeploy.
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {ERRORS[error] ?? "Something went wrong. Please try again."}
          </div>
        )}

        {enabledProviders.google && (
          <>
            <form action={googleSignInAction} className="mt-8">
              <button className="btn w-full border border-white/10 bg-white py-3 text-[15px] text-slate-900 hover:bg-slate-100">
                Sign up with Google
              </button>
            </form>
            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form action={signUpAction} className={enabledProviders.google ? "space-y-3" : "mt-8 space-y-3"}>
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" autoComplete="name" placeholder="Ian Rusnell" className="input py-3" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} placeholder="you@yourbrokerage.com" className="input py-3" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input py-3" />
            <p className="mt-1 text-xs text-slate-500">At least {MIN_PASSWORD} characters.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input py-3" />
          </div>
          <button className="btn-primary w-full py-3 text-[15px]">Create account</button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ember-300 hover:text-ember-200">Sign in</Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-600">
          Version {(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)}
        </p>
      </div>
    </main>
  );
}
