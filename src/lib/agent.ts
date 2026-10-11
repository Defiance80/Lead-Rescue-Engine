// The name the agent signs messages with: their chosen display name, else the
// first word of their account name, else the start of their email.
export function agentFirstName(u: { displayName: string | null; name: string | null; email: string | null }) {
  const raw = u.displayName || u.name?.split(" ")[0] || u.email?.split("@")[0] || "there";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
