// Campaign rules. Pure code (unit-tested).

/** How many emails one "Send" run sends (Brevo's free plan allows 300 a day). */
export const BATCH = 250;

export type Env = Record<string, string | undefined>;

/**
 * Why real campaign sends are switched off on this deployment, or null.
 * Bulk email needs both an explicit switch and the studio's postal address
 * (US CAN-SPAM requires a physical address in marketing email).
 */
export function campaignBlockReason(env: Env): string | null {
  if ((env.STUDIO_CAMPAIGNS ?? "").trim() !== "on") {
    return "Campaign sending is switched off on this deployment (STUDIO_CAMPAIGNS is not \"on\"). Test emails still work.";
  }
  if (!postalAddress(env)) return "Add the studio's mailing address (STUDIO_POSTAL_ADDRESS) first. Marketing emails must include one.";
  return null;
}

export function postalAddress(env: Env): string {
  return (env.STUDIO_POSTAL_ADDRESS ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** {{first_name}} and {{name}} are the only fields a campaign can use. */
export function personalize(text: string, person: { name: string | null }): string {
  const name = (person.name ?? "").trim();
  const first = name.split(/\s+/)[0] || "there";
  return text.replace(/\{\{\s*first_name\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, name || "there");
}

/** Fields in the wording that Studio OS can't fill (shown before approval). */
export function unknownFields(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]).filter((k) => k !== "first_name" && k !== "name"))];
}

/** The footer every campaign email ends with. */
export function campaignFooter(o: { audience: string; address: string; unsubscribeUrl: string }): string {
  return [
    "",
    "—",
    `You're receiving this because you subscribed to ${o.audience} from BLEUSKM Studios.`,
    `Unsubscribe: ${o.unsubscribeUrl}`,
    o.address ? `BLEUSKM Studios · ${o.address}` : "BLEUSKM Studios",
  ].join("\n");
}

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "info" },
  submitted: { label: "Waiting for approval", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  sending: { label: "Sending", tone: "warn" },
  sent: { label: "Sent", tone: "good" },
  cancelled: { label: "Cancelled", tone: "muted" },
};
