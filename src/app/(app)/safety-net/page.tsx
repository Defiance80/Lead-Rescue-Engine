import type { Metadata } from "next";
import type { Lead, Touch } from "@prisma/client";
import { Clock3, Hand, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { safetyNet } from "@/lib/queries";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";
import { ago } from "@/lib/time";

export const metadata: Metadata = { title: "Safety Net" };

export default async function SafetyNetPage() {
  const user = await requireUser();
  const { awaitingHello, overdue, askedForYou } = await safetyNet(user.id);
  const total = new Set([...awaitingHello, ...overdue, ...askedForYou].map((l) => l.id)).size;

  return (
    <div>
      <PageHeader
        eyebrow="Protect"
        accent="text-amber-300"
        title="Safety Net"
        subtitle="Busy days happen. This is where anyone who might drift away gets caught — so a quick touch keeps them with you."
      />

      {total === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing is slipping">
          Every lead has been greeted, follow-ups are on schedule, and no one is waiting on you.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <Group
            icon={Hand}
            color="text-rose-300"
            dot="bg-rose-400"
            title="Asked for you — no personal reply yet"
            empty="Everyone who asked for you has heard back."
            leads={askedForYou.map((l) => ({ l, reason: `${l.needsAgentReason ?? "Wants a person"} · last contact ${ago(l.lastContactAt)}` }))}
          />
          <Group
            icon={MessageCircleHeart}
            color="text-amber-300"
            dot="bg-amber-300"
            title="Still waiting on a first hello"
            empty="Every new lead has been greeted."
            leads={awaitingHello.map((l) => ({ l, reason: `Arrived ${ago(l.createdAt)} — a quick hello now still makes a great impression` }))}
          />
          <Group
            icon={Clock3}
            color="text-sky-300"
            dot="bg-sky-400"
            title="Follow-ups past due"
            empty="All follow-ups are on schedule."
            leads={overdue.map((l) => ({ l, reason: l.touches[0] ? `${l.touches[0].label} was due ${ago(l.touches[0].dueAt)}` : undefined }))}
          />
        </div>
      )}
    </div>
  );
}

function Group({
  icon: Icon,
  color,
  dot,
  title,
  leads,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dot: string;
  title: string;
  empty: string;
  leads: { l: Lead & { touches: Touch[] }; reason?: string }[];
}) {
  return (
    <section>
      <SectionTitle dot={dot}>
        <Icon className={`h-4 w-4 ${color}`} /> {title}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-300">{leads.length}</span>
      </SectionTitle>
      {leads.length ? (
        <div className="space-y-2.5">
          {leads.map(({ l, reason }) => <LeadRow key={l.id} lead={l} next={l.touches[0]} reason={reason} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-500">✓ {empty}</p>
      )}
    </section>
  );
}
