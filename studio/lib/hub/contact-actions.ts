"use server";

import { revalidatePath } from "next/cache";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { writeBlockReason } from "./env.ts";
import { parseTags } from "./contacts.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

async function guard(level: "view" | "edit" = "edit"): Promise<string | null> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return blocked;
  if (!(await dbCheck(null, "contacts", level))) return "You need Edit access to Contacts.";
  return null;
}

/** A private note on a contact's timeline. */
export async function addContactNote(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if (g) return { error: g };
  const id = text(form.get("contact_id"));
  const body = text(form.get("body")).slice(0, 480);
  if (!isUuid(id) || !body) return { error: "Write a note first." };
  const { supabase } = await loadSession();
  const { error } = await supabase.rpc("log_activity", {
    p_section: "contacts", p_production: null, p_contact: id, p_kind: "note.added", p_summary: body,
  });
  if (error) return { error: "Couldn't save the note." };
  revalidatePath(`/contacts/${id}`);
  return { done: "Note added." };
}

export async function saveContactTags(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if (g) return { error: g };
  const id = text(form.get("contact_id"));
  if (!isUuid(id)) return { error: "Unknown contact." };
  const tags = parseTags(text(form.get("tags")));
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("contacts").update({ tags }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Couldn't save the tags." };
  revalidatePath(`/contacts/${id}`);
  return { done: "Tags saved." };
}

/** Unsubscribe from one audience (always allowed with Edit; it sticks). */
export async function unsubscribeContact(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if (g) return { error: g };
  const id = text(form.get("subscription_id"));
  const contact = text(form.get("contact_id"));
  if (!isUuid(id) || !isUuid(contact)) return { error: "Unknown subscription." };
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("contact_subscriptions")
    .update({ status: "unsubscribed", unsubscribe_reason: text(form.get("reason")).slice(0, 500) || "Unsubscribed by the studio" })
    .eq("id", id).select("id, audience_id");
  if (error || !data?.length) return { error: "Couldn't unsubscribe." };
  await supabase.rpc("log_activity", { p_section: "contacts", p_production: null, p_contact: contact, p_kind: "subscription.unsubscribed", p_summary: "Unsubscribed by the studio" });
  revalidatePath(`/contacts/${contact}`);
  return { done: "Unsubscribed." };
}

/** Subscribe with a recorded consent (e.g. a signed form or an email asking to join). */
export async function subscribeContact(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if (g) return { error: g };
  const contact = text(form.get("contact_id"));
  const audience = text(form.get("audience_id"));
  const source = text(form.get("consent_source")).slice(0, 200);
  const wording = text(form.get("consent_text")).slice(0, 2000);
  if (!isUuid(contact) || !isUuid(audience)) return { error: "Choose a list." };
  if (!source) return { error: "Say where and how this person agreed (for example: “Asked by email on Dec 2”)." };
  const { supabase } = await loadSession();
  const { error } = await supabase.from("contact_subscriptions").upsert(
    { contact_id: contact, audience_id: audience, status: "subscribed", consent_source: source, consent_text: wording || null, consented_at: new Date().toISOString(), unsubscribed_at: null },
    { onConflict: "contact_id,audience_id" },
  );
  if (error) return { error: error.code === "23514" ? (error.message.includes("opt in again") ? "This person unsubscribed. They have to opt in again themselves (on the website or by asking you in writing, which you then record as a new consent)." : "Record the consent first.") : "Couldn't subscribe." };
  await supabase.rpc("log_activity", { p_section: "contacts", p_production: null, p_contact: contact, p_kind: "subscription.added", p_summary: `Subscribed by the studio (${source})` });
  revalidatePath(`/contacts/${contact}`);
  return { done: "Subscribed, with the consent recorded." };
}

/** Owner only: fold a duplicate into this contact. */
export async function mergeContact(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if (g) return { error: g };
  const into = text(form.get("contact_id"));
  const fromEmail = text(form.get("duplicate_email")).toLowerCase();
  const fromId = text(form.get("duplicate_id"));
  if (!isUuid(into)) return { error: "Unknown contact." };
  const { supabase } = await loadSession();
  let from = isUuid(fromId) ? fromId : "";
  if (!from && fromEmail) {
    const { data } = await supabase.from("contacts").select("id").eq("email", fromEmail).is("merged_into", null).maybeSingle();
    from = (data?.id as string | undefined) ?? "";
  }
  if (!from) return { error: "No other contact has that email." };
  const { error } = await supabase.rpc("merge_contacts", { p_from: from, p_into: into });
  if (error) return { error: error.code === "42501" ? "Only the owner can merge contacts." : "Couldn't merge these contacts." };
  revalidatePath("/contacts", "layout");
  return { done: "Merged. Everything from the duplicate is now on this contact." };
}
