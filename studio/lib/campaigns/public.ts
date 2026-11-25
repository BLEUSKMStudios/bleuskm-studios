import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isToken } from "@/lib/hub/links";

/** The campaign email behind an unsubscribe link (server key; only that person and audience). */
export async function recipientByToken(token: string): Promise<{ admin: SupabaseClient; id: string; contactId: string; audienceId: string; audience: string; campaign: string; email: string; unsubscribed: boolean } | null> {
  if (!isToken(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: r } = await admin.from("campaign_recipients").select("id, contact_id, email, campaign_id, campaigns(name, audience_id, audiences(name))").eq("token_hash", hashToken(token)).maybeSingle();
  if (!r) return null;
  const c = r.campaigns as unknown as { name: string; audience_id: string; audiences: { name: string } | null };
  const { data: sub } = await admin.from("contact_subscriptions").select("status").eq("contact_id", r.contact_id).eq("audience_id", c.audience_id).maybeSingle();
  return { admin, id: r.id as string, contactId: r.contact_id as string, audienceId: c.audience_id, audience: c.audiences?.name ?? "our emails", campaign: c.name, email: r.email as string, unsubscribed: sub?.status === "unsubscribed" };
}

export async function unsubscribe(token: string): Promise<boolean> {
  const r = await recipientByToken(token);
  if (!r) return false;
  if (!r.unsubscribed) {
    const now = new Date().toISOString();
    await r.admin.from("contact_subscriptions").update({ status: "unsubscribed", unsubscribed_at: now, unsubscribe_reason: `Unsubscribe link in "${r.campaign}"`.slice(0, 500) })
      .eq("contact_id", r.contactId).eq("audience_id", r.audienceId);
    await r.admin.from("campaign_recipients").update({ unsubscribed_at: now }).eq("id", r.id);
    await r.admin.from("activity").insert({ section: "contacts", contact_id: r.contactId, kind: "subscription.unsubscribed",
      summary: `Unsubscribed from ${r.audience} (link in "${r.campaign}")`.slice(0, 500), subject_table: "campaign_recipients", subject_id: r.id, details: {} });
  }
  return true;
}
