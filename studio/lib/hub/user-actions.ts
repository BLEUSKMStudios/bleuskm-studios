"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOwner, loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { diffGrants, readGrid, type Grant } from "./access.ts";

export type ActionState = { error?: string; done?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOREVER = "876000h"; // about 100 years: Supabase's way to block sign-in

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** The person being managed. Never the owner: the owner always has full access. */
async function target(id: string) {
  if (!isUuid(id)) return null;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("profiles").select("id, email, full_name, is_owner, status").eq("id", id).maybeSingle();
  return data && !data.is_owner ? data : null;
}

export async function invitePerson(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner(); // checked on every post: a form can be sent from anywhere
  const email = text(form.get("email")).toLowerCase();
  const fullName = text(form.get("full_name"));
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!fullName || fullName.length > 120) return { error: "Enter the person's name." };
  const admin = createAdminClient();
  if (!admin) return { error: "Studio OS isn't connected to its database." };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${await origin()}/auth/confirm?next=/set-password`,
  });
  if (error) {
    return { error: /already|exists|registered/i.test(error.message) ? "That email already has an account." : "The invitation couldn't be sent. Try again in a minute." };
  }
  revalidatePath("/settings/users");
  return { done: `Invitation sent to ${email}. They start with no access until you grant it.` };
}

export async function setActive(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const person = await target(text(form.get("user_id")));
  if (!person) return { error: "That account can't be changed here." };
  const active = text(form.get("active")) === "true";
  const { supabase } = await loadSession();
  const { error } = await supabase
    .from("profiles")
    .update(active ? { status: "active", deactivated_at: null } : { status: "deactivated", deactivated_at: new Date().toISOString() })
    .eq("id", person.id);
  if (error) return { error: "The change couldn't be saved. Try again." };
  // Also block (or unblock) the sign-in itself. The hub and the database already
  // refuse a deactivated account on every request, so this is a second lock.
  const admin = createAdminClient();
  const lock = admin ? await admin.auth.admin.updateUserById(person.id, { ban_duration: active ? "none" : FOREVER }) : null;
  revalidatePath("/settings/users", "layout");
  const note = lock && !lock.error ? "" : " (The hub refuses them already; the sign-in lock will be retried next time.)";
  return { done: active ? `${person.full_name} can sign in again with their existing access.${note}` : `${person.full_name} is deactivated and can't open the hub.${note}` };
}

export async function sendReset(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const person = await target(text(form.get("user_id")));
  if (!person) return { error: "That account can't be changed here." };
  if (person.status !== "active") return { error: "Reactivate the account first." };
  const { supabase } = await loadSession();
  const { error } = await supabase.auth.resetPasswordForEmail(person.email, { redirectTo: `${await origin()}/auth/confirm?next=/set-password` });
  if (error) return { error: "The email couldn't be sent. Try again in a minute." };
  return { done: `Password reset email sent to ${person.email}.` };
}

export async function resendInvite(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const person = await target(text(form.get("user_id")));
  if (!person) return { error: "That account can't be changed here." };
  const admin = createAdminClient();
  if (!admin) return { error: "Studio OS isn't connected to its database." };
  const { error } = await admin.auth.admin.inviteUserByEmail(person.email, {
    data: { full_name: person.full_name },
    redirectTo: `${await origin()}/auth/confirm?next=/set-password`,
  });
  if (error) return { error: "The invitation couldn't be sent. If they already accepted it, send a password reset instead." };
  return { done: `Invitation sent again to ${person.email}.` };
}

/** Applies a wanted set of grants for one person, changing only what differs. */
async function applyGrants(userId: string, wanted: Grant[]): Promise<{ error?: string; changed: number }> {
  const { supabase } = await loadSession();
  const { data: current, error: readError } = await supabase.from("access_grants").select("id, production_id, section_key, level").eq("user_id", userId);
  if (readError) return { error: "Access couldn't be loaded.", changed: 0 };
  const c = diffGrants((current ?? []) as Grant[], wanted);
  if (c.remove.length) {
    const { error } = await supabase.from("access_grants").delete().in("id", c.remove);
    if (error) return { error: "Some changes couldn't be saved. Reload and check the grid.", changed: 0 };
  }
  for (const u of c.update) {
    const { error } = await supabase.from("access_grants").update({ level: u.level }).eq("id", u.id);
    if (error) return { error: "Some changes couldn't be saved. Reload and check the grid.", changed: c.remove.length };
  }
  if (c.insert.length) {
    const { error } = await supabase.from("access_grants").insert(c.insert.map((g) => ({ ...g, user_id: userId })));
    if (error) return { error: "Some changes couldn't be saved. Reload and check the grid.", changed: c.remove.length + c.update.length };
  }
  return { changed: c.remove.length + c.update.length + c.insert.length };
}

async function productionIds(): Promise<Set<string>> {
  const { supabase } = await loadSession();
  const { data } = await supabase.from("productions").select("id");
  return new Set((data ?? []).map((r) => r.id as string));
}

export async function saveGrid(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const person = await target(text(form.get("user_id")));
  if (!person) return { error: "That account can't be changed here." };
  const wanted = readGrid(form.entries(), await productionIds());
  const r = await applyGrants(person.id, wanted);
  revalidatePath(`/settings/users/${person.id}`);
  if (r.error) return { error: r.error };
  return { done: r.changed === 0 ? "No changes to save." : `Saved ${r.changed} change${r.changed === 1 ? "" : "s"}.` };
}

export async function copyAccess(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const person = await target(text(form.get("user_id")));
  const source = await target(text(form.get("from_user_id")));
  if (!person || !source || person.id === source.id) return { error: "Choose another person to copy from." };
  const { supabase } = await loadSession();
  const { data } = await supabase.from("access_grants").select("production_id, section_key, level").eq("user_id", source.id);
  const r = await applyGrants(person.id, (data ?? []) as Grant[]);
  revalidatePath(`/settings/users/${person.id}`);
  if (r.error) return { error: r.error };
  return { done: `${person.full_name} now has the same access as ${source.full_name}.` };
}
