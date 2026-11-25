"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { writeBlockReason } from "./env.ts";
import { hashToken, newToken, publicBase } from "./links.ts";
import { sendTransactional } from "./mailer.ts";
import { isShareable } from "./doc-files.ts";
import { firstName } from "./templates.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const IDENTITIES = new Set(["casting", "crew", "studio"]);

async function base(): Promise<string> {
  const h = await headers();
  return publicBase(process.env, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

function packageEmail(o: { name: string; film: string; message: string; link: string; count: number; ack: boolean }) {
  return [
    `Hi ${firstName(o.name)},`,
    "",
    o.message || `Here are your production materials for ${o.film}.`,
    "",
    `Your ${o.count} ${o.count === 1 ? "document is" : "documents are"} on your personal page:`,
    o.link,
    "",
    o.ack ? "Please open them and confirm on that page that you've received everything." : "",
    "Questions? Just reply to this email.",
    "",
    "BLEUSKM Studios",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** Sends production materials to one person through a personal link, from their profile. */
export async function sendOnboarding(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const productionId = text(form.get("production_id"));
  if (!isUuid(productionId) || !(await dbCheck(productionId, "documents", "edit"))) return { error: "You need Edit access to Documents on this production." };
  const name = text(form.get("recipient_name")).slice(0, 200);
  const email = text(form.get("recipient_email")).toLowerCase();
  if (!name) return { error: "Enter the person's name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  const identity = text(form.get("identity"));
  if (!IDENTITIES.has(identity)) return { error: "Choose who it's from." };
  const docIds = form.getAll("document_id").map(text).filter(isUuid).slice(0, 30);
  if (!docIds.length) return { error: "Choose at least one document." };
  const subject = text(form.get("subject")).slice(0, 300) || "Your production materials";
  const message = text(form.get("message")).slice(0, 20000);
  const opt = (k: string) => (isUuid(text(form.get(k))) ? text(form.get(k)) : null);
  const { supabase } = await loadSession();
  const [{ data: docs }, { data: prod }] = await Promise.all([
    supabase.from("documents").select("id, title, category, production_id, storage_path, drive_url").in("id", docIds).eq("production_id", productionId),
    supabase.from("productions").select("title").eq("id", productionId).maybeSingle(),
  ]);
  const usable = (docs ?? []).filter((d) => isShareable(d.category as string) && (d.storage_path || d.drive_url));
  if (usable.length !== docIds.length) return { error: "Some of those documents can't be sent (no file or link yet, or a private kind such as a contract)." };
  const admin = createAdminClient();
  if (!admin) return { error: "Email isn't set up on this deployment (server key missing)." };

  const token = newToken();
  const { data: pkg, error } = await supabase.from("onboarding_packages").insert({
    production_id: productionId, team_id: opt("team_id"), application_id: opt("application_id"), contact_id: opt("contact_id"),
    recipient_name: name, recipient_email: email, identity_key: identity, subject, message: message || null,
    require_ack: form.get("require_ack") === "on", token_hash: hashToken(token),
  }).select("id").single();
  if (error || !pkg) return { error: "Couldn't prepare the package." };
  const order = new Map(docIds.map((id, i) => [id, i]));
  const { error: itemErr } = await supabase.from("onboarding_items").insert(usable.map((d) => ({
    package_id: pkg.id, document_id: d.id, title: d.title, category: d.category, sort: order.get(d.id as string) ?? 0,
  })));
  if (itemErr) return { error: "Couldn't prepare the package's documents." };
  const link = `${await base()}/d/${token}`;
  const sent = await sendTransactional(admin, {
    identityKey: identity, to: { email, name }, subject,
    body: packageEmail({ name, film: (prod?.title as string) ?? "the production", message, link, count: usable.length, ack: form.get("require_ack") === "on" }),
    idempotencyKey: `onboarding:${pkg.id}`, contactId: opt("contact_id"), productionId, section: "documents",
    templateKey: "onboarding_package", related: { table: "onboarding_packages", id: pkg.id as string }, sentByName: me.fullName,
    activityKind: "onboarding.email", activitySummary: `Onboarding materials emailed to ${email} (${usable.length} documents)`,
  });
  if (sent.status !== "sent") return { error: `The package was saved but the email wasn't sent: ${sent.reason}` };
  await supabase.from("onboarding_packages").update({ status: "sent", sent_at: new Date().toISOString(), message_id: sent.messageId }).eq("id", pkg.id);
  revalidatePath("/onboarding", "layout");
  redirect(`/onboarding/${pkg.id}?sent=1`);
}

export async function cancelOnboarding(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("id"));
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("onboarding_packages").update({ status: "cancelled", token_hash: null }).eq("id", id).in("status", ["sent", "opened"]).select("id");
  if (error || !data?.length) return { error: "Only an open package can be cancelled." };
  revalidatePath(`/onboarding/${id}`);
  return { done: "Cancelled. The link no longer works." };
}
