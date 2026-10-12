import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { AlertCircle, Bot, CheckCircle2, LifeBuoy, MailWarning, PhoneOff, SendHorizontal, UserX } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { normalizeLead } from "@/lib/normalize";
import { ago } from "@/lib/time";
import { EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { dismissIssueAction, rescueIssueAction, resolveIssueAction } from "../../actions";

export const metadata: Metadata = { title: "Rescue Queue" };

const KIND: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  unreachable: { label: "Can't reach them yet", icon: PhoneOff, tone: "text-rose-300 bg-rose-500/10" },
  possible_spam: { label: "Might be spam", icon: Bot, tone: "text-slate-300 bg-white/5" },
  invalid_email: { label: "Email needs a fix", icon: MailWarning, tone: "text-amber-300 bg-amber-400/10" },
  invalid_phone: { label: "Phone needs a fix", icon: PhoneOff, tone: "text-amber-300 bg-amber-400/10" },
  missing_name: { label: "Missing a name", icon: UserX, tone: "text-amber-300 bg-amber-400/10" },
  send_failed: { label: "Message didn't go through", icon: SendHorizontal, tone: "text-rose-300 bg-rose-500/10" },
  bad_payload: { label: "Couldn't read this one", icon: AlertCircle, tone: "text-rose-300 bg-rose-500/10" },
};

export default async function RescuePage({ searchParams }: { searchParams: Promise<{ stillStuck?: string; added?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [issues, resolvedCount] = await Promise.all([
    db.intakeIssue.findMany({ where: { userId: user.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.intakeIssue.count({ where: { userId: user.id, status: "RESOLVED" } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Protect"
        accent="text-cyan-300"
        title="Rescue Queue"
        subtitle="Leads that arrived with a hiccup — a typo'd email, no phone, a failed text. Nothing gets thrown away; fix it here and it's right back in play."
        actions={resolvedCount > 0 && <span className="chip bg-emerald-400/10 px-3 py-1.5 text-emerald-300 ring-emerald-400/30"><CheckCircle2 className="h-3.5 w-3.5" /> {resolvedCount} rescued so far</span>}
      />

      {sp.stillStuck && (
        <div className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          Still need a working email or phone number to rescue that one — give it another look below.
        </div>
      )}
      {sp.added && (
        <div className="mb-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
          That lead was held here for a quick check before it goes into your pipeline.
        </div>
      )}

      {issues.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Queue is clear" tone="cyan">
          Every lead that came in was processed cleanly. If something ever arrives broken, it lands here instead of vanishing.
        </EmptyState>
      ) : (
        <div data-tour="rescue-cards" className="grid gap-4 xl:grid-cols-2">
          {issues.map((iss) => {
            const k = KIND[iss.kind] ?? KIND.bad_payload;
            const n = normalizeLead(iss.payload);
            const linked = !!iss.leadId;
            return (
              <article key={iss.id} className="card card-pad flex flex-col">
                <div className="flex items-start gap-3">
                  <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", k.tone)}>
                    <k.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-white">{k.label}</h3>
                      <span className="text-xs text-slate-500">{ago(iss.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-400">{iss.problem}</p>
                  </div>
                </div>

                {linked ? (
                  <div className="mt-4 flex flex-1 items-end justify-between gap-2 rounded-xl bg-white/[0.03] p-3 text-sm">
                    <span className="text-slate-300">
                      {n.firstName ?? "This lead"} is in your pipeline — just double-check their details.
                    </span>
                  </div>
                ) : (
                  <form action={rescueIssueAction} className="mt-4 grid flex-1 gap-2 sm:grid-cols-2">
                    <input type="hidden" name="issueId" value={iss.id} />
                    <input name="name" defaultValue={[n.firstName, n.lastName].filter(Boolean).join(" ")} placeholder="Name" className="input" />
                    <input name="email" defaultValue={n.email ?? n.emailRaw ?? ""} placeholder="Email" className="input" />
                    <input name="phone" defaultValue={n.phone ?? n.phoneRaw ?? ""} placeholder="Phone" className="input" />
                    <input disabled value={n.source} className="input opacity-60" aria-label="Source" />
                    {n.inquiry && <input name="inquiry" defaultValue={n.inquiry} className="input sm:col-span-2" aria-label="Message" />}
                    <button className="btn-cyan sm:col-span-2">
                      <LifeBuoy className="h-4 w-4" /> {iss.kind === "possible_spam" ? "It's real — rescue it" : "Rescue this lead"}
                    </button>
                  </form>
                )}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                  {linked && (
                    <>
                      <Link href={`/leads/${iss.leadId}`} className="btn-secondary btn-sm">Open lead</Link>
                      <ActionButton action={resolveIssueAction.bind(null, iss.id)} className="btn-ghost btn-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> Looks good now
                      </ActionButton>
                    </>
                  )}
                  <ActionButton action={dismissIssueAction.bind(null, iss.id)} className="btn-ghost btn-sm text-slate-500">
                    {iss.kind === "possible_spam" ? "Yes, it's spam" : "Dismiss"}
                  </ActionButton>
                  <details className="ml-auto text-xs text-slate-500">
                    <summary className="cursor-pointer py-1.5">Raw data</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] text-slate-400">{JSON.stringify(iss.payload, null, 2)}</pre>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
