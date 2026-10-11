// Realistic sample leads so the dashboard is alive on day one.
// All sample leads are flagged isSample and can be cleared in one click.

import { db } from "./db";
import { ingestLead } from "./intake";
import { completeTouch, recordEvent, type EventType } from "./engagement";

type Sample = {
  payload: Record<string, unknown>;
  minutesAgo: number;
  contacted?: boolean; // first hello already sent
  doneThroughDay?: number; // follow-ups completed through this day
  events?: { type: EventType; note?: string }[];
};

const SAMPLES: Sample[] = [
  {
    payload: { first_name: "Marcus", last_name: "Reed", email: "marcus.reed@example.com", phone: "310-555-0142", source: "Zillow", city: "Redondo Beach", price_range: "$1.4M - $1.7M", message: "Saw a few places on Esplanade. Could we tour this weekend?" },
    minutesAgo: 60 * 26, contacted: true, doneThroughDay: 1,
    events: [{ type: "viewed_properties" }, { type: "reply_text", note: "Can we see the Esplanade one Saturday morning?" }],
  },
  {
    payload: { name: "Jennifer Alvarez", email: "jen.alvarez@example.com", phone: "(424) 555-0199", source: "Website", property: "123 Ocean Ave", city: "Manhattan Beach", message: "Is this still available?" },
    minutesAgo: 7,
  },
  {
    payload: { first_name: "Priya", last_name: "Shah", email: "priya.shah@example.com", phone: "+1 213 555 0110", source: "Facebook Lead Ads", campaign: "South Bay Move-Up", city: "Torrance", budget: "950k", financing: "Pre-approved", timeline: "Next 60 days", message: "We're pre-approved and want to move before school starts." },
    minutesAgo: 60 * 3, contacted: true,
  },
  {
    payload: { first_name: "Dana", last_name: "Whitfield", email: "dana.w@example.com", phone: "310 555 0177", source: "Google Ads", lead_type: "seller", city: "Hermosa Beach", message: "What's my home worth? Thinking of selling in the spring." },
    minutesAgo: 60 * 50, contacted: true, doneThroughDay: 1,
    events: [{ type: "reply_email", note: "Yes please send the recent sales near me." }],
  },
  {
    payload: { first_name: "Chris", last_name: "Nguyen", email: "chris.nguyen@example.com", phone: "562-555-0123", source: "Realtor.com", property: "88 Palm Dr", mls: "SB24-1188", city: "Long Beach", message: "Interested in this one." },
    minutesAgo: 60 * 24 * 4, contacted: true, doneThroughDay: 1,
  },
  {
    payload: { first_name: "Olivia", last_name: "Brooks", email: "olivia.brooks@example.com", source: "Open House", property: "412 Vista Ln", city: "Palos Verdes", message: "Loved the open house. Do you have others like it?" },
    minutesAgo: 60 * 24 * 2, contacted: true,
    events: [{ type: "calendar_booked", note: "Booked consult for Thursday 4pm" }],
  },
  {
    payload: { first_name: "Sam", last_name: "Okafor", email: "sam.okafor@example.com", phone: "310.555.0188", source: "Instagram", city: "El Segundo", message: "Just starting to look, maybe next year." },
    minutesAgo: 60 * 24 * 8, contacted: true, doneThroughDay: 7,
  },
  {
    payload: { first_name: "Rachel", last_name: "Kim", email: "rachel.kim@example.com", phone: "424-555-0155", source: "Referral", referral: "Tom & Lisa Grant", city: "Manhattan Beach", timeline: "ASAP", message: "Tom said you're the person to call. We need to sell my condo and buy something bigger asap." },
    minutesAgo: 35,
  },
  {
    payload: { first_name: "Luis", last_name: "Romero", email: "luis.romero@example.com", phone: "310-555-0166", source: "Zillow", property: "19 Harbor Way", city: "Redondo Beach", message: "Looking for a family-friendly area near good schools." },
    minutesAgo: 60 * 5,
  },
  {
    payload: { first_name: "Hannah", last_name: "Lee", email: "hannah.lee@example.com", phone: "213-555-0100", source: "Website", city: "Torrance", message: "Sending some questions about financing." },
    minutesAgo: 60 * 24 * 15, contacted: true, doneThroughDay: 14,
    events: [{ type: "mortgage_question", note: "What would my payment be at $800K with 10% down?" }],
  },
  {
    payload: { first_name: "Ben", last_name: "Carter", email: "ben.carter@example.com", source: "Facebook Lead Ads", city: "Gardena", message: "Info please" },
    minutesAgo: 60 * 24 * 35, contacted: true, doneThroughDay: 14,
  },
  {
    payload: { first_name: "Grace", last_name: "Patel", email: "grace.patel@example.com", phone: "424-555-0133", source: "Google Ads", city: "Hermosa Beach", price_range: "1.1m-1.3m", message: "Want to see 2-3 homes next week if possible." },
    minutesAgo: 60 * 30, contacted: true,
  },
  // These two show off the Rescue Queue
  { payload: { name: "Mike", email: "mike@@example", phone: "555-01", source: "Open House", message: "Call me about the house on 5th" }, minutesAgo: 90 },
  { payload: { name: "Best SEO Agency", email: "promo@example.com", source: "Website", message: "We offer SEO backlinks! https://spam.example https://spam2.example" }, minutesAgo: 200 },
];

export async function loadSampleData(userId: string) {
  for (const s of SAMPLES) {
    const createdAt = new Date(Date.now() - s.minutesAgo * 60000);
    const res = await ingestLead(userId, { ...s.payload, _sample: true }, { actor: "webhook", isSample: true, createdAt });
    if (res.outcome !== "created") continue;
    const leadId = res.leadId;

    if (s.contacted || s.doneThroughDay !== undefined) {
      const through = s.doneThroughDay ?? 0;
      const touches = await db.touch.findMany({
        where: { leadId, status: "PENDING", day: { lte: through }, channel: { not: "TASK" } },
        orderBy: { dueAt: "asc" },
      });
      for (const t of touches) {
        await completeTouch(userId, t.id, "autopilot");
        const when = new Date(t.dueAt.getTime() + 2 * 60000);
        await db.touch.update({ where: { id: t.id }, data: { completedAt: when } });
        await db.lead.updateMany({ where: { id: leadId, firstResponseAt: { gt: when } }, data: { firstResponseAt: when } });
      }
      // Make the sample "first response" times realistic.
      await db.activity.updateMany({ where: { leadId, kind: { in: ["sms", "email"] } }, data: { createdAt: new Date(createdAt.getTime() + 2 * 60000) } });
    }
    for (const e of s.events ?? []) await recordEvent(userId, leadId, e.type, e.note ?? null, "n8n");
  }
}

export async function clearSampleData(userId: string) {
  const sampleLeads = await db.lead.findMany({ where: { userId, isSample: true }, select: { id: true } });
  await db.intakeIssue.deleteMany({
    where: {
      userId,
      OR: [{ leadId: { in: sampleLeads.map((l) => l.id) } }, { payload: { path: ["_sample"], equals: true } }],
    },
  });
  await db.lead.deleteMany({ where: { userId, isSample: true } });
}
