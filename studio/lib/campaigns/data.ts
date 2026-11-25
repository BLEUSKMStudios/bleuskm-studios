import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { marketingEligible } from "@/lib/hub/mail-rules";
import type { AudienceOption } from "@/components/campaigns/CampaignForm";

/** Marketing audiences and how many people can receive a campaign now (counts only). */
export async function marketingAudiences(): Promise<AudienceOption[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data: auds } = await admin.from("audiences").select("id, name").eq("marketing", true).order("name");
  const out: AudienceOption[] = [];
  for (const a of auds ?? []) {
    const { data: subs } = await admin.from("contact_subscriptions").select("status, contacts!inner(email, email_status, merged_into)").eq("audience_id", a.id).eq("status", "subscribed").limit(20000);
    const emails = new Set<string>();
    for (const s of subs ?? []) {
      const c = s.contacts as unknown as { email: string | null; email_status: string; merged_into: string | null };
      if (marketingEligible({ status: s.status as string }, c)) emails.add(c.email!);
    }
    out.push({ id: a.id as string, name: a.name as string, eligible: emails.size });
  }
  return out;
}
