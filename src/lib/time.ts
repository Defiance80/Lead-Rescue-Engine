// Small date helpers. No date library needed for what we do.

export function ago(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const v =
    a < 60 ? "just now"
    : a < 3600 ? `${Math.floor(a / 60)}m`
    : a < 86400 ? `${Math.floor(a / 3600)}h`
    : a < 86400 * 30 ? `${Math.floor(a / 86400)}d`
    : `${Math.floor(a / (86400 * 30))}mo`;
  if (v === "just now") return v;
  return future ? `in ${v}` : `${v} ago`;
}

export function duration(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)} hr`;
  return `${(h / 24).toFixed(1)} days`;
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const addHours = (d: Date, n: number) => new Date(d.getTime() + n * 3600000);

export function startOfToday(timezone: string, now = new Date()): Date {
  // Midnight in the agent's timezone, expressed as a UTC Date.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return new Date(now.getTime() - elapsed - now.getMilliseconds());
}

export function localHour(timezone: string, now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

// Quiet hours can wrap past midnight (e.g. 21 → 8).
export function inQuietHours(timezone: string, start: number, end: number, now = new Date()): boolean {
  const h = localHour(timezone, now);
  if (start === end) return false;
  return start > end ? h >= start || h < end : h >= start && h < end;
}

export function greeting(timezone: string): string {
  const h = localHour(timezone);
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export function priceRange(min?: number | null, max?: number | null): string | null {
  if (min && max) return `${money(min)}–${money(max)}`;
  if (max) return `Up to ${money(max)}`;
  if (min) return `${money(min)}+`;
  return null;
}
