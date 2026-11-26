import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendCastingEmail } from "./brevo.ts";
import { sendTransactional } from "./mailer.ts";

/**
 * Sends one casting or crew email to an applicant and records it in the
 * applicant's messages, the Communications log and their timeline. The
 * caller has already checked Casting edit access on the production.
 *
 * sendKey makes the send idempotent: the same form submitted twice (double
 * click, retry) sends once.
 */
export async function deliverToApplicant(
  supabase: SupabaseClient,
  o: {
    application: { id: string; email: string; full_name: string; production_id: string; contact_id?: string | null };
    crew: boolean;
    subject: string;
    body: string;
    sendKey: string;
    templateId?: string | null;
    templateKey?: string | null;
    sentByName?: string | null;
    activityKind?: string;
  },
): Promise<{ ok: true; providerId: string | null; skipped?: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  let result: { ok: true; providerId: string | null; skipped?: boolean } | { ok: false; error: string };
  if (admin) {
    let contactId = o.application.contact_id ?? null;
    if (contactId === undefined || contactId === null) {
      const { data } = await admin.from("casting_applications").select("contact_id").eq("id", o.application.id).maybeSingle();
      contactId = (data?.contact_id as string | null) ?? null;
    }
    const r = await sendTransactional(admin, {
      identityKey: o.crew ? "crew" : "casting",
      to: { email: o.application.email, name: o.application.full_name },
      subject: o.subject,
      body: o.body,
      idempotencyKey: o.sendKey,
      contactId,
      productionId: o.application.production_id,
      section: "casting",
      templateKey: o.templateKey ?? null,
      related: { table: "casting_applications", id: o.application.id },
      sentByName: o.sentByName ?? null,
      activityKind: o.activityKind ?? "email.sent",
      activitySummary: `Email from ${o.crew ? "crew@" : "casting@"}: ${o.subject}`,
      tags: [o.crew ? "studio-os-crew" : "studio-os-casting"],
    });
    if (r.status === "skipped") return { ok: true, providerId: null, skipped: true };
    result = r.status === "sent" ? { ok: true, providerId: r.providerId } : { ok: false, error: r.reason };
  } else {
    // No server key: the original direct path (not de-duplicated or on the timeline).
    const r = await sendCastingEmail({ email: o.application.email, name: o.application.full_name }, o.subject, o.body, o.crew);
    result = r.ok ? { ok: true, providerId: r.id } : { ok: false, error: r.error };
  }
  await supabase.from("casting_messages").insert({
    application_id: o.application.id, production_id: o.application.production_id, template_id: o.templateId ?? null,
    to_email: o.application.email, subject: o.subject, body: o.body, status: result.ok ? "sent" : "failed",
    provider_id: result.ok ? result.providerId : null, error: result.ok ? null : result.error,
  });
  return result;
}
