import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IntakeInput } from "./intake-rules.ts";
import { sendTransactional, type SendOutcome } from "./mailer.ts";
import { confirmationKey, firstName, render } from "./templates.ts";

export type IntakeResult = {
  submissionId: string;
  contactId: string | null;
  duplicate: boolean;
  confirmation: SendOutcome["status"] | "website" | "none" | "off";
};

/**
 * Records a website submission in Studio OS and, when Studio OS owns the
 * confirmation for this form and the template is switched on, sends it once.
 */
export async function recordIntake(admin: SupabaseClient, input: IntakeInput): Promise<IntakeResult> {
  const { data, error } = await admin.rpc("studio_intake", { p: input });
  if (error || !data) throw new Error(`intake_failed_${error?.code ?? "unknown"}`);
  const res = data as { submission_id: string; contact_id: string | null; duplicate: boolean };
  const out: IntakeResult = { submissionId: res.submission_id, contactId: res.contact_id, duplicate: res.duplicate, confirmation: input.confirmation === "website" ? "website" : "none" };
  if (input.confirmation !== "studio" || !res.contact_id) return out;

  const key = confirmationKey(input.kind);
  if (!key) return out;
  const { data: sub } = await admin.from("intake_submissions").select("production_id, section").eq("id", res.submission_id).single();
  // A production's own template wins over the studio default.
  const { data: templates } = await admin.from("email_templates")
    .select("production_id, identity_key, subject, preview_text, body, auto_send")
    .eq("key", key)
    .or(sub?.production_id ? `production_id.is.null,production_id.eq.${sub.production_id}` : "production_id.is.null");
  const t = (templates ?? []).sort((a, b) => (a.production_id ? -1 : 0) - (b.production_id ? -1 : 0))[0];
  if (!t || !t.auto_send) return { ...out, confirmation: "off" };

  const vars = { first_name: firstName(input.name), name: input.name ?? "", film: input.film ?? "", role: input.role ?? "", email: input.email };
  const sent = await sendTransactional(admin, {
    identityKey: t.identity_key,
    to: { email: input.email, name: input.name },
    subject: render(t.subject, vars),
    body: render(t.body, vars),
    previewText: t.preview_text ? render(t.preview_text, vars) : null,
    // One confirmation per submission, ever.
    idempotencyKey: `confirm:${res.submission_id}`,
    contactId: res.contact_id,
    productionId: sub?.production_id ?? null,
    section: sub?.section ?? "contacts",
    templateKey: key,
    related: { table: "intake_submissions", id: res.submission_id },
    activityKind: "email.confirmation",
    activitySummary: `Confirmation sent: ${render(t.subject, vars)}`,
  });
  return { ...out, confirmation: sent.status };
}
