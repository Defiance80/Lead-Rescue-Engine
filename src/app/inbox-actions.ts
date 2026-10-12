"use server";

// Server Actions for the Inbox Assistant and Export & Sync pages.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/crypto";
import { providerByKey } from "@/lib/mail/providers";
import { testConnection } from "@/lib/mail/imap";
import { sendItem, syncMailbox } from "@/lib/assistant/process";
import { ingestLead } from "@/lib/intake";
import { leadsForExport, pushToHubspot, pushToMailchimp, type ExportFilters } from "@/lib/export";

const refresh = () => revalidatePath("/", "layout");
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// ── Mailbox ────────────────────────────────────────────────────────────────

export async function connectMailboxAction(formData: FormData) {
  const user = await requireUser();
  const provider = providerByKey(str(formData.get("provider")));
  const email = str(formData.get("email")).toLowerCase();
  // App passwords are often shown with spaces ("abcd efgh ijkl mnop") — remove them.
  const password = str(formData.get("password")).replace(/\s+/g, "");
  const custom = provider.key === "custom";
  const cfg = {
    provider: provider.key,
    email,
    username: str(formData.get("username")) || email,
    password,
    imapHost: custom ? str(formData.get("imapHost")) : provider.imap.host,
    imapPort: custom ? Number(formData.get("imapPort")) || 993 : provider.imap.port,
    imapSecure: custom ? str(formData.get("imapPort")) !== "143" : provider.imap.secure,
    smtpHost: custom ? str(formData.get("smtpHost")) : provider.smtp.host,
    smtpPort: custom ? Number(formData.get("smtpPort")) || 465 : provider.smtp.port,
    smtpSecure: custom ? (Number(formData.get("smtpPort")) || 465) === 465 : provider.smtp.secure,
  };
  const back = (error: string) =>
    redirect(`/inbox?provider=${provider.key}&email=${encodeURIComponent(email)}&error=${encodeURIComponent(error)}`);

  if (!email.includes("@") || !password) back("Enter the email address and its app password.");
  if (custom && (!cfg.imapHost || !cfg.smtpHost)) back("Enter both server names for a custom provider.");

  const test = await testConnection(cfg);
  if (!test.ok) back(`${test.step === "read" ? "Reading mail" : "Sending mail"}: ${test.error}`);

  const data = {
    provider: cfg.provider,
    email: cfg.email,
    username: cfg.username,
    secretEnc: encrypt(cfg.password),
    imapHost: cfg.imapHost,
    imapPort: cfg.imapPort,
    imapSecure: cfg.imapSecure,
    smtpHost: cfg.smtpHost,
    smtpPort: cfg.smtpPort,
    smtpSecure: cfg.smtpSecure,
    enabled: true,
    lastUid: 0,
    uidValidity: null,
    lastError: null,
  };
  await db.mailAccount.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: { ...data, createdAt: new Date() } });
  await syncMailbox(user.id);
  refresh();
  redirect("/inbox?connected=1");
}

export async function disconnectMailboxAction() {
  const user = await requireUser();
  await db.mailAccount.deleteMany({ where: { userId: user.id } });
  refresh();
  redirect("/inbox");
}

export async function updateAssistantAction(formData: FormData) {
  const user = await requireUser();
  const mins = Number(formData.get("replyWindowMins"));
  await db.mailAccount.update({
    where: { userId: user.id },
    data: {
      mode: str(formData.get("mode")) === "auto" ? "auto" : "approve",
      replyWindowMins: [15, 30, 60, 120, 240, 480, 1440].includes(mins) ? mins : 120,
      signAs: str(formData.get("signAs")) === "assistant" ? "assistant" : "agent",
      assistantName: str(formData.get("assistantName")) || null,
      enabled: formData.get("enabled") !== "off",
    },
  });
  refresh();
  redirect("/inbox?saved=1");
}

export async function syncNowAction() {
  const user = await requireUser();
  const r = await syncMailbox(user.id);
  refresh();
  return r;
}

// ── Individual emails ──────────────────────────────────────────────────────

async function ownItem(itemId: string) {
  const user = await requireUser();
  const item = await db.inboxItem.findFirst({ where: { id: itemId, userId: user.id } });
  if (!item) throw new Error("Email not found");
  return { user, item };
}

export async function sendDraftAction(formData: FormData) {
  const { user, item } = await ownItem(str(formData.get("itemId")));
  const acc = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (!acc) redirect("/inbox");
  const ok = await sendItem(user, acc, item, { subject: str(formData.get("subject")), body: str(formData.get("body")) });
  refresh();
  if (!ok) redirect(`/inbox?sendError=${item.id}`);
}

export async function setItemStatusAction(itemId: string, status: "done" | "you_replied" | "skipped" | "held") {
  const { item } = await ownItem(itemId);
  await db.inboxItem.update({
    where: { id: item.id },
    data: { status, ...(status === "you_replied" ? { repliedAt: new Date() } : {}), ...(status === "held" ? { assistantDueAt: null } : {}) },
  });
  refresh();
}

// Restart the "Cover me" timer from now (e.g. after taking it off hold).
export async function coverMeAction(itemId: string) {
  const { user, item } = await ownItem(itemId);
  const acc = await db.mailAccount.findUnique({ where: { userId: user.id } });
  await db.inboxItem.update({
    where: { id: item.id },
    data: { status: "waiting", riskFlag: null, assistantDueAt: new Date(Date.now() + (acc?.replyWindowMins ?? 120) * 60000) },
  });
  refresh();
}

export async function turnIntoLeadAction(itemId: string) {
  const { user, item } = await ownItem(itemId);
  const c = (item.extracted ?? {}) as Record<string, string | number | null>;
  const res = await ingestLead(
    user.id,
    {
      first_name: c.first_name ?? item.fromName?.split(" ")[0],
      last_name: c.last_name ?? undefined,
      email: c.email ?? item.fromEmail,
      phone: c.phone ?? undefined,
      property: c.property_address ?? undefined,
      city: c.city ?? undefined,
      price_min: c.budget_min ?? undefined,
      price_max: c.budget_max ?? undefined,
      timeline: c.timeline ?? undefined,
      source: "Email",
      message: `${item.subject}\n\n${item.bodyText}`.slice(0, 1500),
    },
    { actor: "agent", trusted: true },
  );
  if (res.outcome !== "queued") {
    await db.inboxItem.update({ where: { id: item.id }, data: { leadId: res.leadId, category: item.category === "new_lead" ? item.category : "new_lead" } });
    refresh();
    redirect(`/leads/${res.leadId}?${res.outcome === "merged" ? "merged=1" : "new=1"}`);
  }
  refresh();
}

// ── Export & Sync ──────────────────────────────────────────────────────────

export async function saveSyncKeysAction(formData: FormData) {
  const user = await requireUser();
  const mcKey = str(formData.get("mailchimpKey"));
  const mcList = str(formData.get("mailchimpListId"));
  const hs = str(formData.get("hubspotToken"));
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(mcKey ? { mailchimpKeyEnc: encrypt(mcKey) } : {}),
      ...(mcList ? { mailchimpListId: mcList } : {}),
      ...(hs ? { hubspotTokenEnc: encrypt(hs) } : {}),
      ...(formData.get("clearMailchimp") ? { mailchimpKeyEnc: null, mailchimpListId: null } : {}),
      ...(formData.get("clearHubspot") ? { hubspotTokenEnc: null } : {}),
    },
  });
  refresh();
  redirect("/export?keys=1");
}

function filtersFrom(formData: FormData): ExportFilters {
  return {
    temperature: str(formData.get("temperature")) || undefined,
    priority: str(formData.get("priority")) || undefined,
    source: str(formData.get("source")) || undefined,
    since: str(formData.get("since")) || undefined,
    includeClosed: formData.get("includeClosed") === "on",
    includeSample: formData.get("includeSample") === "on",
  };
}

export async function pushSyncAction(formData: FormData) {
  const user = await requireUser();
  const dest = str(formData.get("destination"));
  const leads = await leadsForExport(user.id, filtersFrom(formData));
  let r: { ok: number; skipped: number; errors: string[] };
  try {
    if (dest === "mailchimp") {
      if (!user.mailchimpKeyEnc || !user.mailchimpListId) redirect("/export?pushError=" + encodeURIComponent("Add your Mailchimp API key and audience ID first."));
      r = await pushToMailchimp(decrypt(user.mailchimpKeyEnc!), user.mailchimpListId!, leads, formData.get("doubleOptIn") !== "off");
    } else if (dest === "hubspot") {
      if (!user.hubspotTokenEnc) redirect("/export?pushError=" + encodeURIComponent("Add your HubSpot private app token first."));
      r = await pushToHubspot(decrypt(user.hubspotTokenEnc!), leads);
    } else {
      redirect("/export");
    }
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // Next.js redirect
    redirect("/export?pushError=" + encodeURIComponent((err as Error).message.slice(0, 200)));
  }
  const q = new URLSearchParams({ pushed: dest, ok: String(r!.ok), skipped: String(r!.skipped) });
  if (r!.errors.length) q.set("pushError", r!.errors.slice(0, 3).join(" · ").slice(0, 300));
  redirect(`/export?${q}`);
}
