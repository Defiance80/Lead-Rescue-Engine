// Export & Sync: get leads into email-marketing tools and CRMs.
//   • CSV files shaped for each platform's importer (column names they expect)
//   • Direct push to Mailchimp and HubSpot with an API key

import { createHash } from "node:crypto";
import type { Lead, LeadStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { effectivePriority, priorityMeta, temperatureFor, tempMeta } from "./temperature";

export type ExportFilters = {
  temperature?: string; // HOT | WARM | COLD
  priority?: string; // 1 | 2 | 3
  source?: string;
  since?: string; // yyyy-mm-dd
  includeClosed?: boolean;
  includeSample?: boolean;
};

export async function leadsForExport(userId: string, f: ExportFilters) {
  const where: Prisma.LeadWhereInput = {
    userId,
    doNotContact: false,
    ...(f.includeClosed ? {} : { status: { notIn: ["CLOSED"] } }),
    ...(f.includeSample ? {} : { isSample: false }),
    ...(f.source ? { source: f.source } : {}),
    ...(f.since ? { createdAt: { gte: new Date(f.since) } } : {}),
    ...(f.temperature === "HOT" ? { score: { gte: 60 } } : f.temperature === "WARM" ? { score: { gte: 20, lt: 60 } } : f.temperature === "COLD" ? { score: { lt: 20 } } : {}),
  };
  const leads = await db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });
  return f.priority ? leads.filter((l) => String(effectivePriority(l)) === f.priority) : leads;
}

const STAGE: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Attempted contact",
  ENGAGED: "Active",
  APPOINTMENT: "Appointment set",
  CLIENT: "Client",
  LONG_GAME: "Nurture",
  CLOSED: "Closed",
};

const HUBSPOT_STATUS: Record<LeadStatus, string> = {
  NEW: "NEW",
  CONTACTED: "ATTEMPTED_TO_CONTACT",
  ENGAGED: "IN_PROGRESS",
  APPOINTMENT: "CONNECTED",
  CLIENT: "OPEN_DEAL",
  LONG_GAME: "OPEN",
  CLOSED: "UNQUALIFIED",
};

const TYPE_LABEL = { BUYER: "Buyer", SELLER: "Seller", BOTH: "Buyer & Seller", UNKNOWN: "" } as const;

function tags(l: Lead) {
  return [
    tempMeta(temperatureFor(l.score)).label,
    `${priorityMeta(effectivePriority(l)).label} priority`,
    l.source,
    TYPE_LABEL[l.leadType],
    l.city,
  ].filter(Boolean) as string[];
}

const price = (l: Lead) => [l.priceMin, l.priceMax].filter(Boolean).join("-");

type Preset = {
  key: string;
  label: string;
  blurb: string;
  needsEmail: boolean;
  columns: [string, (l: Lead) => string | number | null | undefined][];
};

export const PRESETS: Preset[] = [
  {
    key: "mailchimp",
    label: "Mailchimp",
    blurb: "Audience → Add contacts → Import contacts → Upload a file. Tags carry temperature, priority and source.",
    needsEmail: true,
    columns: [
      ["Email Address", (l) => l.email],
      ["First Name", (l) => l.firstName],
      ["Last Name", (l) => l.lastName],
      ["Phone Number", (l) => l.phone],
      ["Address", (l) => l.property],
      ["Tags", (l) => tags(l).join(",")],
    ],
  },
  {
    key: "hubspot",
    label: "HubSpot",
    blurb: "Contacts → Import → File from computer. Columns map to HubSpot's default contact properties.",
    needsEmail: false,
    columns: [
      ["Email", (l) => l.email],
      ["First Name", (l) => l.firstName],
      ["Last Name", (l) => l.lastName],
      ["Phone Number", (l) => l.phone],
      ["City", (l) => l.city],
      ["Lifecycle Stage", (l) => (l.status === "CLIENT" ? "customer" : l.status === "APPOINTMENT" ? "opportunity" : "lead")],
      ["Lead Status", (l) => HUBSPOT_STATUS[l.status]],
      ["Original Source Drill-Down 1", (l) => l.source],
      ["Temperature", (l) => tempMeta(temperatureFor(l.score)).label],
      ["Priority", (l) => priorityMeta(effectivePriority(l)).label],
      ["Message", (l) => l.inquiry],
    ],
  },
  {
    key: "followupboss",
    label: "Follow Up Boss",
    blurb: "People → Import → upload this file. Stage, source and tags come across.",
    needsEmail: false,
    columns: [
      ["First Name", (l) => l.firstName],
      ["Last Name", (l) => l.lastName],
      ["Email", (l) => l.email],
      ["Phone", (l) => l.phone],
      ["Stage", (l) => STAGE[l.status]],
      ["Source", (l) => l.source],
      ["Tags", (l) => tags(l).join(", ")],
      ["Property Address", (l) => l.property],
      ["Property City", (l) => l.city],
      ["Price", (l) => price(l)],
      ["Notes", (l) => l.inquiry],
    ],
  },
  {
    key: "google",
    label: "Google Contacts",
    blurb: "contacts.google.com → Import → select this file. Labels carry temperature and source.",
    needsEmail: false,
    columns: [
      ["First Name", (l) => l.firstName],
      ["Last Name", (l) => l.lastName],
      ["E-mail 1 - Value", (l) => l.email],
      ["Phone 1 - Value", (l) => l.phone],
      ["Labels", (l) => tags(l).join(" ::: ")],
      ["Notes", (l) => l.inquiry],
    ],
  },
  {
    key: "full",
    label: "Full spreadsheet",
    blurb: "Every field — for Excel, Google Sheets, or any other system.",
    needsEmail: false,
    columns: [
      ["First Name", (l) => l.firstName],
      ["Last Name", (l) => l.lastName],
      ["Email", (l) => l.email],
      ["Phone", (l) => l.phone],
      ["Temperature", (l) => tempMeta(temperatureFor(l.score)).label],
      ["Priority", (l) => priorityMeta(effectivePriority(l)).label],
      ["Score", (l) => l.score],
      ["Stage", (l) => STAGE[l.status]],
      ["Looking To", (l) => TYPE_LABEL[l.leadType]],
      ["Source", (l) => l.source],
      ["Campaign", (l) => l.campaign],
      ["Property", (l) => l.property],
      ["MLS", (l) => l.mlsNumber],
      ["City", (l) => l.city],
      ["Budget Min", (l) => l.priceMin],
      ["Budget Max", (l) => l.priceMax],
      ["Timeline", (l) => l.timeline],
      ["Financing", (l) => l.financing],
      ["Inquiry", (l) => l.inquiry],
      ["Texts OK", (l) => (l.smsConsent ? "Yes" : "No")],
      ["Emails OK", (l) => (l.emailOptOut ? "No" : "Yes")],
      ["Created", (l) => l.createdAt.toISOString().slice(0, 10)],
      ["Last Contact", (l) => l.lastContactAt?.toISOString().slice(0, 10)],
    ],
  },
];

export const presetByKey = (k: string) => PRESETS.find((p) => p.key === k);

function cell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formulas (CSV injection) and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(preset: Preset, leads: Lead[]) {
  const rows = leads.filter((l) => !preset.needsEmail || (l.email && !l.emailOptOut));
  const header = preset.columns.map(([h]) => cell(h)).join(",");
  const body = rows.map((l) => preset.columns.map(([, fn]) => cell(fn(l))).join(","));
  // BOM so Excel opens accents correctly.
  return { csv: "﻿" + [header, ...body].join("\r\n"), count: rows.length };
}

// ── Direct sync ─────────────────────────────────────────────────────────────

export async function pushToMailchimp(apiKey: string, listId: string, leads: Lead[], doubleOptIn: boolean) {
  const dc = apiKey.split("-")[1];
  if (!dc) throw new Error("That doesn't look like a Mailchimp API key (it should end in something like -us21).");
  const auth = "Basic " + Buffer.from(`any:${apiKey}`).toString("base64");
  const base = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members`;
  const rows = leads.filter((l) => l.email && !l.emailOptOut);
  let ok = 0;
  const errors: string[] = [];
  for (const l of rows) {
    const hash = createHash("md5").update(l.email!.toLowerCase()).digest("hex");
    const res = await fetch(`${base}/${hash}`, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email_address: l.email,
        status_if_new: doubleOptIn ? "pending" : "subscribed",
        merge_fields: { FNAME: l.firstName ?? "", LNAME: l.lastName ?? "", PHONE: l.phone ?? "" },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { title?: string; detail?: string };
      errors.push(`${l.email}: ${body.detail ?? body.title ?? res.status}`);
      if (res.status === 401 || res.status === 404) break; // bad key or audience — stop early
      continue;
    }
    await fetch(`${base}/${hash}/tags`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: tags(l).map((name) => ({ name, status: "active" })) }),
    });
    ok++;
  }
  return { ok, skipped: leads.length - rows.length, errors };
}

export async function pushToHubspot(token: string, leads: Lead[]) {
  const rows = leads.filter((l) => l.email);
  let ok = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: chunk.map((l) => ({
          idProperty: "email",
          id: l.email,
          properties: {
            email: l.email,
            firstname: l.firstName ?? "",
            lastname: l.lastName ?? "",
            phone: l.phone ?? "",
            city: l.city ?? "",
            lifecyclestage: l.status === "CLIENT" ? "customer" : l.status === "APPOINTMENT" ? "opportunity" : "lead",
            hs_lead_status: HUBSPOT_STATUS[l.status],
          },
        })),
      }),
    });
    if (res.ok) ok += chunk.length;
    else {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      errors.push(body.message ?? `HubSpot returned ${res.status}`);
      if (res.status === 401 || res.status === 403) break;
    }
  }
  return { ok, skipped: leads.length - rows.length, errors };
}
