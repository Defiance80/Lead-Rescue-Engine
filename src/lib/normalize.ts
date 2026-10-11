// Lead sources all name their fields differently ("first_name", "firstName",
// "First Name", "fname"…). This file turns any of them into one clean shape.

export type NormalizedLead = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailRaw: string | null;
  phone: string | null; // E.164 or null
  phoneRaw: string | null;
  source: string;
  campaign: string | null;
  property: string | null;
  mlsNumber: string | null;
  city: string | null;
  priceMin: number | null;
  priceMax: number | null;
  inquiry: string | null;
  landingPage: string | null;
  referral: string | null;
  timeline: string | null;
  financing: string | null;
  leadType: "BUYER" | "SELLER" | "BOTH" | "UNKNOWN";
  smsConsent: boolean;
};

// Each output field lists the incoming names we accept for it.
const ALIASES: Record<string, string[]> = {
  firstName: ["firstname", "first_name", "fname", "first", "givenname", "given_name"],
  lastName: ["lastname", "last_name", "lname", "last", "surname", "familyname", "family_name"],
  fullName: ["name", "fullname", "full_name", "contactname", "contact_name"],
  email: ["email", "emailaddress", "email_address", "e_mail", "mail"],
  phone: ["phone", "phonenumber", "phone_number", "mobile", "cell", "tel", "telephone", "mobilephone"],
  source: ["source", "leadsource", "lead_source", "utm_source", "platform", "origin"],
  campaign: ["campaign", "campaignname", "campaign_name", "utm_campaign", "adname", "ad_name"],
  property: ["property", "propertyaddress", "property_address", "address", "listing", "listingaddress", "listing_address", "home"],
  mlsNumber: ["mls", "mlsnumber", "mls_number", "mlsid", "mls_id", "listingid", "listing_id"],
  city: ["city", "desiredcity", "desired_city", "location", "area", "market", "neighborhood"],
  priceMin: ["pricemin", "price_min", "minprice", "min_price", "budgetmin", "budget_min"],
  priceMax: ["pricemax", "price_max", "maxprice", "max_price", "budgetmax", "budget_max", "budget", "price"],
  priceRange: ["pricerange", "price_range", "desiredpricerange", "budgetrange", "budget_range"],
  inquiry: ["inquiry", "message", "comments", "comment", "question", "notes", "inquirytext", "inquiry_text", "body"],
  landingPage: ["landingpage", "landing_page", "pageurl", "page_url", "url", "referrer_url"],
  referral: ["referral", "referralsource", "referral_source", "referredby", "referred_by"],
  timeline: ["timeline", "timeframe", "time_frame", "movingdate", "moving_date", "when"],
  financing: ["financing", "financingstatus", "financing_status", "preapproved", "pre_approved", "mortgage"],
  leadType: ["leadtype", "lead_type", "type", "intent", "buyerorseller", "buyer_seller"],
  smsConsent: ["smsconsent", "sms_consent", "textconsent", "text_consent", "optin", "opt_in", "consent"],
};

function key(k: string) {
  return k.toLowerCase().replace(/[\s\-.]/g, "").replace(/_/g, "");
}

function pick(flat: Record<string, unknown>, field: string): string | null {
  for (const alias of ALIASES[field]) {
    const v = flat[key(alias)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// Facebook Lead Ads send { field_data: [{ name, values: [] }] } — flatten that,
// plus any nested objects, into one level of lowercase keys.
function flatten(input: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (!input || typeof input !== "object") return out;
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object" && "name" in item && ("values" in item || "value" in item)) {
        const rec = item as { name: string; values?: unknown[]; value?: unknown };
        out[key(rec.name)] = Array.isArray(rec.values) ? rec.values[0] : rec.value;
      } else flatten(item, out);
    }
    return out;
  }
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v && typeof v === "object") flatten(v, out);
    else if (!(key(k) in out)) out[key(k)] = v;
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

// US-first phone normalization → E.164 (+1XXXXXXXXXX). Accepts +country codes too.
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 && !/^[01]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function toMoney(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.toLowerCase().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
  return Math.round(n);
}

function parseRange(raw: string | null): [number | null, number | null] {
  if (!raw) return [null, null];
  const parts = raw.split(/\s*(?:-|–|to)\s*/i);
  if (parts.length === 2) return [toMoney(parts[0]), toMoney(parts[1])];
  return [null, toMoney(raw)];
}

function titleCase(s: string | null) {
  if (!s) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, p, c: string) => p + c.toUpperCase());
}

export function normalizeLead(payload: unknown): NormalizedLead {
  const flat = flatten(payload);

  let firstName = pick(flat, "firstName");
  let lastName = pick(flat, "lastName");
  const full = pick(flat, "fullName");
  if (!firstName && full) {
    const [f, ...rest] = full.split(/\s+/);
    firstName = f;
    lastName = lastName ?? (rest.join(" ") || null);
  }

  const emailRaw = pick(flat, "email");
  const phoneRaw = pick(flat, "phone");

  let [priceMin, priceMax] = parseRange(pick(flat, "priceRange"));
  priceMin = toMoney(pick(flat, "priceMin")) ?? priceMin;
  const pm = pick(flat, "priceMax");
  if (pm) {
    const [a, b] = parseRange(pm);
    if (b !== null) priceMax = b;
    if (a !== null && priceMin === null) priceMin = a;
  }

  const typeRaw = (pick(flat, "leadType") ?? "").toLowerCase();
  const leadType: NormalizedLead["leadType"] =
    /both|buy.*sell|sell.*buy/.test(typeRaw)
      ? "BOTH"
      : /sell|valuation|listing/.test(typeRaw)
        ? "SELLER"
        : /buy/.test(typeRaw)
          ? "BUYER"
          : "UNKNOWN";

  const consentRaw = pick(flat, "smsConsent");
  const smsConsent = consentRaw === null ? true : !/^(false|no|0|n|off)$/i.test(consentRaw);

  return {
    firstName: titleCase(firstName),
    lastName: titleCase(lastName),
    email: normalizeEmail(emailRaw),
    emailRaw,
    phone: normalizePhone(phoneRaw),
    phoneRaw,
    source: pick(flat, "source") ?? "Website",
    campaign: pick(flat, "campaign"),
    property: pick(flat, "property"),
    mlsNumber: pick(flat, "mlsNumber"),
    city: titleCase(pick(flat, "city")),
    priceMin,
    priceMax,
    inquiry: pick(flat, "inquiry"),
    landingPage: pick(flat, "landingPage"),
    referral: pick(flat, "referral"),
    timeline: pick(flat, "timeline"),
    financing: pick(flat, "financing"),
    leadType,
    smsConsent,
  };
}
