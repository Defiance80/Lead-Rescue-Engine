// Talking to the mailbox.
//   IMAP = reading (inbox + sent folder)   SMTP = sending replies
// Works with Gmail, Outlook, Yahoo, iCloud, Hostinger, or any standard host.

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { MailAccount } from "@prisma/client";
import { decrypt } from "../crypto";

export type MailConfig = {
  provider: string;
  email: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

export type IncomingEmail = {
  uid: number;
  messageId: string;
  references: string | null;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  text: string; // newest part of the message, quoted history trimmed
  date: Date;
  automated: boolean; // newsletters, receipts, no-reply senders…
};

export type SentRef = { to: string[]; inReplyTo: string | null; date: Date };

export function configFrom(acc: MailAccount): MailConfig {
  return {
    provider: acc.provider,
    email: acc.email,
    username: acc.username,
    password: decrypt(acc.secretEnc),
    imapHost: acc.imapHost,
    imapPort: acc.imapPort,
    imapSecure: acc.imapSecure,
    smtpHost: acc.smtpHost,
    smtpPort: acc.smtpPort,
    smtpSecure: acc.smtpSecure,
  };
}

function imapClient(c: MailConfig) {
  return new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.imapSecure,
    auth: { user: c.username, pass: c.password },
    logger: false,
    socketTimeout: 30_000,
  });
}

function smtpTransport(c: MailConfig) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    auth: { user: c.username, pass: c.password },
    connectionTimeout: 15_000,
  });
}

// Plain-English versions of the errors people actually hit.
export function friendlyMailError(err: unknown): string {
  const m = String((err as Error)?.message ?? err);
  if (/auth|credentials|login|password|535|invalid/i.test(m))
    return "The email or app password wasn't accepted. Double-check both — most providers need an app password, not your normal one.";
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return "Couldn't find that mail server. Check the server name.";
  if (/ETIMEDOUT|timeout|ECONNREFUSED/i.test(m)) return "The mail server didn't answer. Check the server name and port.";
  if (/IMAP.*(disabled|not enabled)/i.test(m)) return "IMAP access is turned off for this mailbox. Turn it on in your email settings.";
  return m.slice(0, 240);
}

export async function testConnection(c: MailConfig): Promise<{ ok: true } | { ok: false; step: "read" | "send"; error: string }> {
  const client = imapClient(c);
  try {
    await client.connect();
    await client.logout();
  } catch (err) {
    return { ok: false, step: "read", error: friendlyMailError(err) };
  }
  try {
    await smtpTransport(c).verify();
  } catch (err) {
    return { ok: false, step: "send", error: friendlyMailError(err) };
  }
  return { ok: true };
}

const firstAddress = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a[0] : a)?.value?.[0];

const allAddresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);

// Keep only the new part of a reply: drop quoted lines and the "On … wrote:" tail.
export function newestPart(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .{5,200}wrote:\s*$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || (/^From: .+/.test(t) && out.length > 3)) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

const NOREPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|mailer-daemon|postmaster|bounce)/i;

export async function fetchNew(
  acc: MailAccount,
  opts: { maxMessages: number; lookbackDays: number; sentSince?: Date | null },
): Promise<{ emails: IncomingEmail[]; uidValidity: string; lastUid: number; sent: SentRef[] }> {
  const c = configFrom(acc);
  const client = imapClient(c);
  await client.connect();
  const emails: IncomingEmail[] = [];
  const sent: SentRef[] = [];
  let uidValidity = "";
  let lastUid = acc.lastUid;

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox;
      uidValidity = box ? String(box.uidValidity) : "";
      const uidNext = box ? Number(box.uidNext) : 0;
      const fresh = acc.uidValidity !== uidValidity || acc.lastUid === 0;
      const gmail = c.imapHost.includes("gmail");

      // Gmail can filter to the Primary tab directly. Elsewhere we filter by headers.
      const query: Record<string, unknown> = fresh
        ? { since: new Date(Date.now() - opts.lookbackDays * 86400000) }
        : { uid: `${acc.lastUid + 1}:*` };
      if (gmail) query.gmraw = "category:primary";

      const found = ((await client.search(query, { uid: true })) || []) as number[];
      const uids = found.filter((u) => fresh || u > acc.lastUid).sort((a, b) => a - b);
      const batch = uids.slice(-opts.maxMessages);
      const capped = uids.length > batch.length;

      for (const uid of batch) {
        const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const p = await simpleParser(msg.source);
        const from = firstAddress(p.from);
        if (!from?.address) continue;
        const h = p.headers;
        const precedence = String(h.get("precedence") ?? "").toLowerCase();
        const autoSubmitted = String(h.get("auto-submitted") ?? "no").toLowerCase();
        const automated =
          h.has("list-unsubscribe") ||
          h.has("list-id") ||
          ["bulk", "list", "junk"].includes(precedence) ||
          autoSubmitted !== "no" ||
          NOREPLY.test(from.address) ||
          from.address.toLowerCase() === c.email.toLowerCase();
        const refs = Array.isArray(p.references) ? p.references.join(" ") : p.references ?? null;
        emails.push({
          uid,
          messageId: p.messageId ?? `uid-${uidValidity}-${uid}@${c.imapHost}`,
          references: [refs, p.messageId].filter(Boolean).join(" ") || null,
          fromName: from.name || null,
          fromEmail: from.address.toLowerCase(),
          subject: p.subject ?? "(no subject)",
          text: newestPart(p.text ?? (typeof p.html === "string" ? p.html.replace(/<[^>]+>/g, " ") : "")),
          date: p.date ?? new Date(),
          automated,
        });
      }
      // Move the bookmark forward so we never read the same email twice.
      lastUid = capped ? Math.max(acc.lastUid, ...batch, 0) : Math.max(acc.lastUid, uidNext - 1, ...batch, 0);
    } finally {
      lock.release();
    }

    // Look at the Sent folder to notice replies the agent sent personally.
    if (opts.sentSince) {
      const boxes = await client.list();
      const sentBox = boxes.find((b) => b.specialUse === "\\Sent") ?? boxes.find((b) => /^sent( items| mail)?$/i.test(b.name));
      if (sentBox) {
        const lock = await client.getMailboxLock(sentBox.path);
        try {
          const ids = ((await client.search({ since: opts.sentSince }, { uid: true })) || []) as number[];
          for (const uid of ids.slice(-200)) {
            const m = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
            if (!m || !m.envelope) continue;
            sent.push({
              to: [...(m.envelope.to ?? []), ...(m.envelope.cc ?? [])].map((a) => (a.address ?? "").toLowerCase()),
              inReplyTo: m.envelope.inReplyTo ?? null,
              date: m.envelope.date ? new Date(m.envelope.date) : new Date(0),
            });
          }
        } finally {
          lock.release();
        }
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { emails, uidValidity, lastUid, sent };
}

// Sends a reply in the same thread, then files a copy in Sent (Gmail does
// that by itself; most other hosts don't).
export async function sendReply(
  acc: MailAccount,
  msg: { to: string; toName?: string | null; fromName: string; subject: string; text: string; inReplyTo: string; references?: string | null },
) {
  const c = configFrom(acc);
  const options = {
    from: { name: msg.fromName, address: c.email },
    to: msg.toName ? { name: msg.toName, address: msg.to } : msg.to,
    subject: msg.subject,
    text: msg.text,
    inReplyTo: msg.inReplyTo,
    references: msg.references ?? msg.inReplyTo,
  };
  const raw = await new MailComposer(options).compile().build();
  await smtpTransport(c).sendMail({ envelope: { from: c.email, to: [msg.to] }, raw });

  if (!c.imapHost.includes("gmail")) {
    const client = imapClient(c);
    try {
      await client.connect();
      const boxes = await client.list();
      const sentBox = boxes.find((b) => b.specialUse === "\\Sent");
      if (sentBox) await client.append(sentBox.path, raw, ["\\Seen"]);
    } catch {
      /* the email was sent; filing a copy is best-effort */
    } finally {
      await client.logout().catch(() => {});
    }
  }
}
