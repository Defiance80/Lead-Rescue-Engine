// Ready-made settings for common email providers, plus the short "how to get
// an app password" steps shown in the connect wizard.

export type ProviderKey = "gmail" | "outlook" | "yahoo" | "icloud" | "hostinger" | "custom";

export type Provider = {
  key: ProviderKey;
  label: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  steps: string[];
  helpUrl?: string;
};

export const PROVIDERS: Provider[] = [
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    steps: [
      "Turn on 2-Step Verification for the Google account (myaccount.google.com → Security).",
      "Open myaccount.google.com/apppasswords, name it “Lead Rescue”, and click Create.",
      "Copy the 16-letter password Google shows and paste it below (spaces are fine).",
    ],
    helpUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    key: "outlook",
    label: "Outlook / Microsoft 365",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    steps: [
      "Sign in at account.microsoft.com → Security → Advanced security options.",
      "Under App passwords, create a new one and paste it below.",
      "Work accounts: your IT admin may need to allow IMAP/SMTP.",
    ],
    helpUrl: "https://account.microsoft.com/security",
  },
  {
    key: "yahoo",
    label: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    steps: ["Yahoo Account Security → Generate app password → paste it below."],
    helpUrl: "https://login.yahoo.com/account/security",
  },
  {
    key: "icloud",
    label: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    steps: ["appleid.apple.com → Sign-In and Security → App-Specific Passwords → paste it below."],
    helpUrl: "https://appleid.apple.com",
  },
  {
    key: "hostinger",
    label: "Hostinger email",
    imap: { host: "imap.hostinger.com", port: 993, secure: true },
    smtp: { host: "smtp.hostinger.com", port: 465, secure: true },
    steps: ["Use your full email address and the mailbox password from hPanel → Emails."],
  },
  {
    key: "custom",
    label: "Other provider",
    imap: { host: "", port: 993, secure: true },
    smtp: { host: "", port: 465, secure: true },
    steps: ["Find the IMAP and SMTP settings in your email host's help pages (often under “mail client setup”)."],
  },
];

export const providerByKey = (k: string) => PROVIDERS.find((p) => p.key === k) ?? PROVIDERS[PROVIDERS.length - 1];

// Guess the provider from the email domain to pre-select the right card.
export function guessProvider(email: string): ProviderKey {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  if (/gmail\.com|googlemail\.com/.test(d)) return "gmail";
  if (/outlook|hotmail|live\.com|msn\.com/.test(d)) return "outlook";
  if (/yahoo/.test(d)) return "yahoo";
  if (/icloud|me\.com|mac\.com/.test(d)) return "icloud";
  return "gmail"; // most custom domains for small brokerages run on Google Workspace
}
