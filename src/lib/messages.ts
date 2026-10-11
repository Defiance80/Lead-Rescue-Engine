// Follow-up plan + message drafts.
//
// GUARDRAIL: these templates only ever reference facts the lead gave us
// (their name, the property/area they asked about). They never claim a home
// is available, a price changed, an offer exists, or anything about the
// seller. When a lead asks about status, the message promises the agent will
// confirm — it never guesses.

import type { Channel } from "@prisma/client";

export type LeadContext = {
  firstName: string;
  property?: string | null;
  city?: string | null;
  inquiry?: string | null;
  leadType?: string | null;
};

export type AgentContext = {
  name: string; // "Ian"
  business?: string | null;
};

export type PlannedTouch = {
  day: number;
  channel: Channel;
  label: string;
  subject?: string;
  message: string;
};

function topic(l: LeadContext) {
  if (l.property) return `the home at ${l.property}`;
  if (l.city) return `homes in ${l.city}`;
  if (l.leadType === "SELLER") return "your home";
  return "your home search";
}

function area(l: LeadContext) {
  return l.city ?? "the area";
}

function asksAboutStatus(inquiry?: string | null) {
  return !!inquiry && /\b(available|still (on|for sale)|sold|pending|price|offers?|reduced)\b/i.test(inquiry);
}

function signoff(a: AgentContext) {
  return a.business ? `${a.name}\n${a.business}` : a.name;
}

export function buildPlan(lead: LeadContext, agent: AgentContext): PlannedTouch[] {
  const first = lead.firstName || "there";
  const t = topic(lead);
  const isSeller = lead.leadType === "SELLER";
  const confirm = asksAboutStatus(lead.inquiry)
    ? " I'm confirming the latest status on it now and will get right back to you."
    : "";

  const day0Sms = isSeller
    ? `Hi ${first}, it's ${agent.name}. Thanks for reaching out about ${t}. Are you thinking about selling soon, or just curious what it might be worth right now? Reply STOP to opt out.`
    : lead.property
      ? `Hi ${first}, it's ${agent.name}. I saw your request about ${t}.${confirm} Are you mainly looking for info on that one, or comparing a few homes in ${area(lead)} right now? Reply STOP to opt out.`
      : `Hi ${first}, it's ${agent.name}. Thanks for reaching out about ${t}. What's most important to you in your next place? Reply STOP to opt out.`;

  const day0Email = isSeller
    ? `Hi ${first},\n\nThanks for reaching out about ${t}. I'd be glad to help you understand where things stand — no pressure and no obligation.\n\nAre you planning a move soon, or mostly gathering information for now? Either way, I can put together a clear picture for you.\n\nTalk soon,\n${signoff(agent)}`
    : `Hi ${first},\n\nThanks for your note about ${t}.${confirm}\n\nTo point you in the right direction: are you focused on that specific home, or also open to similar options in ${area(lead)}? If it helps, I'm happy to set up a time to see it.\n\nTalk soon,\n${signoff(agent)}`;

  return [
    { day: 0, channel: "SMS", label: "First hello (text)", message: day0Sms },
    {
      day: 0,
      channel: "EMAIL",
      label: "First hello (email)",
      subject: lead.property ? `About ${lead.property}` : isSeller ? "Your home" : "Your home search",
      message: day0Email,
    },
    {
      day: 1,
      channel: "SMS",
      label: "Gentle check-in",
      message: `Hi ${first}, just making sure my note came through about ${t}. Happy to send details or set up a time — whatever's easiest for you.`,
    },
    {
      day: 3,
      channel: "EMAIL",
      label: "Something useful",
      subject: isSeller ? `A quick look at ${area(lead)}` : `A few ideas in ${area(lead)}`,
      message: isSeller
        ? `Hi ${first},\n\nI can put together a simple snapshot of recent sales near you so you have real numbers to think with. Want me to send it over?\n\n${signoff(agent)}`
        : `Hi ${first},\n\nStill thinking about ${t}? I can send you a short, hand-picked list of homes in ${area(lead)} that fit what you're after — including any new ones as they come up.\n\nWant me to put that together?\n\n${signoff(agent)}`,
    },
    {
      day: 7,
      channel: "SMS",
      label: "Friendly re-connect",
      message: `Hi ${first}, no pressure at all — are you still looking around ${area(lead)}, or has your plan changed? Either answer helps me help you.`,
    },
    {
      day: 14,
      channel: "EMAIL",
      label: "Market update",
      subject: `What's new in ${area(lead)}`,
      message: `Hi ${first},\n\nI've been keeping an eye on ${area(lead)} for you. Would a quick update on what's new in your range be helpful? Just reply "yes" and I'll send it.\n\n${signoff(agent)}`,
    },
    {
      day: 30,
      channel: "TASK",
      label: "Move to Long Game",
      message: `No reply after 30 days. ${first} moves to the Long Game list for light monthly check-ins.`,
    },
  ];
}

// Words that can signal a Fair Housing-sensitive conversation. These are not
// "bad leads" — they just deserve a human reply, not an automated one.
const SENSITIVE =
  /\b(safe (neighborhood|area)|good schools?|family[- ]friendly|church|mosque|synagogue|temple|ethnic|race|religio|disab|wheelchair|handicap|no kids|adults only|immigra|section 8|voucher|minorit|demographic)/i;

export function reviewFlagFor(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(SENSITIVE);
  return m ? `Mentions "${m[0]}" — worth a personal reply` : null;
}
