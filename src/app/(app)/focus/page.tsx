import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { nextMoveFor, priorityLane } from "@/lib/queries";
import { priceRange } from "@/lib/time";
import { FocusDeck, type FocusCard } from "@/components/focus-deck";

export const metadata: Metadata = { title: "Focus Mode" };

export default async function FocusPage() {
  const user = await requireUser();
  const lane = await priorityLane(user.id, 30);
  const cards: FocusCard[] = lane.map((l) => {
    const move = nextMoveFor(l);
    const t = l.touches[0];
    return {
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      score: l.score,
      phone: l.phone,
      email: l.email,
      smsOk: l.smsConsent && !!l.phone,
      where: l.property ?? l.city,
      budget: priceRange(l.priceMin, l.priceMax),
      source: l.source,
      inquiry: l.inquiry,
      createdAt: l.createdAt.toISOString(),
      respondedAt: l.firstResponseAt?.toISOString() ?? null,
      headline: move.headline,
      why: move.why,
      touch: t && t.channel !== "TASK" ? { id: t.id, channel: t.channel, label: t.label, subject: t.subject, message: t.message } : null,
    };
  });
  return <FocusDeck cards={cards} />;
}
