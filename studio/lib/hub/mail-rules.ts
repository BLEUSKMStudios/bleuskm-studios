// Rules for whether an email may be sent. Pure code (unit-tested).

export type IdentityRow = {
  key: string;
  address: string;
  display_name: string;
  reply_to: string | null;
  purpose: string;
  zoho_kind: "unverified" | "alias" | "group" | "forwarding" | "mailbox";
  brevo_verified: boolean;
  zoho_send_as: boolean;
  verified_at: string | null;
  notes: string | null;
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

/** Why a transactional (Brevo) email may not go out, or null when it may. */
export function sendGate(o: {
  writeBlock: string | null;
  brevoKey: boolean;
  identity: IdentityRow | null;
  emailStatus: string | null;
  to: string;
}): string | null {
  if (o.writeBlock) return o.writeBlock;
  if (!EMAIL_RE.test(o.to)) return "The email address is not valid.";
  if (!o.identity) return "That sender identity does not exist.";
  if (!o.identity.brevo_verified) {
    return `${o.identity.address} is not marked as a verified Brevo sender yet. The owner confirms it in Settings, Email senders.`;
  }
  if (!o.brevoKey) return "Email is not set up yet (BREVO_KEY missing in the hub's Vercel project).";
  if (o.emailStatus && o.emailStatus !== "ok") return `This address is marked ${o.emailStatus}, so nothing is sent to it.`;
  return null;
}

/** Why a Zoho send (reply or compose) may not use this From address. */
export function zohoFromGate(identity: IdentityRow | null): string | null {
  if (!identity) return "That sender identity does not exist.";
  if (!identity.zoho_send_as) {
    return `${identity.address} is not confirmed as a "send as" address in Zoho yet. The owner confirms it in Settings, Email senders.`;
  }
  return null;
}

/** Marketing email only goes to people who are subscribed and deliverable. */
export function marketingEligible(sub: { status: string }, contact: { email: string | null; email_status: string; merged_into: string | null }): boolean {
  return sub.status === "subscribed" && !!contact.email && contact.email_status === "ok" && !contact.merged_into;
}

/** Which department address a message about something should come from. */
export function identityFor(o: { crew?: boolean; kind?: string }): string {
  if (o.kind === "newsletter") return "newsletter";
  if (o.kind === "film") return "films";
  if (o.kind === "studio" || o.kind === "inquiry" || o.kind === "client_inquiry") return "studio";
  return o.crew ? "crew" : "casting";
}
