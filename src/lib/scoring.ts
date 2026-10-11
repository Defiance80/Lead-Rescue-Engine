// Lead scoring (0–100).
//
// A lead's score is the sum of the "signals" it has collected, clamped to
// 0–100. Storing the signal *keys* (instead of just a number) means we can
// always explain WHY a lead is hot, and we never double-count the same signal.

export type SignalKey =
  | "inquiry"
  | "valid_phone"
  | "replied_text"
  | "replied_email"
  | "viewed_multiple"
  | "showing_requested"
  | "timeline_90"
  | "preapproved"
  | "home_to_sell"
  | "returned"
  | "valuation_request"
  | "calendar_booked"
  | "link_clicked"
  | "invalid_phone"
  | "unsubscribed"
  | "stale_30"
  | "spam";

export const SIGNALS: Record<SignalKey, { label: string; points: number }> = {
  inquiry: { label: "Submitted an inquiry", points: 10 },
  valid_phone: { label: "Valid phone number", points: 5 },
  replied_text: { label: "Replied to a text", points: 15 },
  replied_email: { label: "Replied to an email", points: 10 },
  viewed_multiple: { label: "Viewed multiple properties", points: 10 },
  showing_requested: { label: "Asked for a showing", points: 25 },
  timeline_90: { label: "Timeline under 90 days", points: 15 },
  preapproved: { label: "Mortgage pre-approved", points: 20 },
  home_to_sell: { label: "Has a home to sell first", points: 10 },
  returned: { label: "Came back / re-inquired", points: 5 },
  valuation_request: { label: "Asked what their home is worth", points: 15 },
  calendar_booked: { label: "Booked time on the calendar", points: 25 },
  link_clicked: { label: "Clicked a link", points: 5 },
  invalid_phone: { label: "Phone number didn't work", points: -20 },
  unsubscribed: { label: "Unsubscribed", points: -50 },
  stale_30: { label: "Quiet for 30+ days", points: -10 },
  spam: { label: "Looks like spam", points: -100 },
};

export function scoreFor(signals: string[]): number {
  const unique = Array.from(new Set(signals));
  const total = unique.reduce(
    (sum, key) => sum + (SIGNALS[key as SignalKey]?.points ?? 0),
    0,
  );
  return Math.max(0, Math.min(100, total));
}

export function addSignals(current: string[], add: SignalKey[]): string[] {
  return Array.from(new Set([...current, ...add]));
}

// Reads the original inquiry and picks up obvious intent clues.
// Deliberately simple keyword matching: predictable, explainable, free.
export function signalsFromText(text: string | null | undefined): SignalKey[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const found: SignalKey[] = [];
  if (/\b(tour|showing|show me|see (it|the home|the house|this)|walk ?through|visit|open house)\b/.test(t))
    found.push("showing_requested");
  if (/\bpre[- ]?approv|\bcash buyer|\bpaying cash\b/.test(t)) found.push("preapproved");
  if (/\b(asap|right away|this (week|month)|next (week|month)|30 days|60 days|90 days|soon|immediately|by (january|february|march|april|may|june|july|august|september|october|november|december))\b/.test(t))
    found.push("timeline_90");
  if (/\b(sell (my|our)|need to sell|selling (my|our)|have a (home|house|condo) to sell)\b/.test(t))
    found.push("home_to_sell");
  if (/\b(what('?s| is) my (home|house) worth|home value|valuation|cma|how much (can|could) i get)\b/.test(t))
    found.push("valuation_request");
  return found;
}
