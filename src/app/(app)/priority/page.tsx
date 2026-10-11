import type { Metadata } from "next";
import Link from "next/link";
import { Crosshair, Flame, Hand, PartyPopper, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { priorityLane } from "@/lib/queries";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";

export const metadata: Metadata = { title: "Priority Lane" };

export default async function PriorityPage() {
  const user = await requireUser();
  const lane = await priorityLane(user.id, 100);

  const wantsYou = lane.filter((l) => l.needsAgent);
  const fresh = lane.filter((l) => !l.needsAgent && !l.firstResponseAt);
  const hot = lane.filter((l) => !l.needsAgent && l.firstResponseAt);

  return (
    <div>
      <PageHeader
        eyebrow="Act now"
        accent="text-rose-400"
        title="Priority Lane"
        subtitle="The people most worth your time right now, best first. Work top to bottom and you can't go wrong."
        actions={
          lane.length > 0 && (
            <Link href="/focus" className="btn-primary">
              <Crosshair className="h-4 w-4" /> One at a time
            </Link>
          )
        }
      />
      {lane.length === 0 ? (
        <EmptyState icon={PartyPopper} title="The lane is clear">
          Nobody is waiting on you. Autopilot is keeping everyone else warm.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {wantsYou.length > 0 && (
            <section>
              <SectionTitle dot="bg-rose-400"><Hand className="h-4 w-4 text-rose-300" /> Asked for you personally <Count n={wantsYou.length} /></SectionTitle>
              <div className="space-y-2.5">{wantsYou.map((l) => <LeadRow key={l.id} lead={l} next={l.touches[0]} reason={l.needsAgentReason ?? undefined} />)}</div>
            </section>
          )}
          {fresh.length > 0 && (
            <section>
              <SectionTitle dot="bg-amber-300"><Sparkles className="h-4 w-4 text-amber-300" /> Fresh — first hello wins <Count n={fresh.length} /></SectionTitle>
              <div className="space-y-2.5">{fresh.map((l) => <LeadRow key={l.id} lead={l} next={l.touches[0]} />)}</div>
            </section>
          )}
          {hot.length > 0 && (
            <section>
              <SectionTitle dot="bg-orange-400"><Flame className="h-4 w-4 text-orange-300" /> Hot & follow-ups due <Count n={hot.length} /></SectionTitle>
              <div className="space-y-2.5">{hot.map((l) => <LeadRow key={l.id} lead={l} next={l.touches[0]} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-300">{n}</span>;
}
