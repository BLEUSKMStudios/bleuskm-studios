"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { readMessage } from "./zoho.ts";
import { replySubject } from "./comms.ts";
import { writeBlockReason } from "./env.ts";
import { EMAIL_RE } from "./mail-rules.ts";
import { fileInbound, sendZoho } from "./zoho-send.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const KEY_RE = /^[a-z]+$/;

async function guard() {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked } as const;
  if (!(await dbCheck(null, "communications", "edit"))) return { error: "You need Studio-level Edit access to Communications to send email." } as const;
  const admin = createAdminClient();
  if (!admin) return { error: "Email isn't set up on this deployment (server key missing)." } as const;
  return { me, admin } as const;
}

/** Replies to one inbox message through Zoho. Sends once per form, whatever the clicks. */
export async function replyToMessage(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const uid = Number(text(form.get("uid")));
  const from = text(form.get("from"));
  const nonce = text(form.get("nonce"));
  const body = text(form.get("body"));
  if (!KEY_RE.test(from)) return { error: "Choose the address to send from." };
  if (!isUuid(nonce)) return { error: "Reload the page and try again." };
  if (!body || body.length > 50000) return { error: "Write a reply (up to 50,000 characters)." };
  const original = await readMessage(uid);
  if (!original || !original.fromEmail) return { error: "The original message couldn't be found." };
  const filed = await fileInbound(g.admin, original);
  const subject = replySubject(original.subject);
  const out = await sendZoho(g.admin, {
    identityKey: from, to: original.fromEmail, subject, text: body, inReplyTo: original.messageId,
    idempotencyKey: `zoho-out:${nonce}`, contactId: filed.contactId, sentByName: g.me.fullName,
    related: filed.id ? { table: "comm_messages", id: filed.id } : null,
  });
  revalidatePath(`/communications/inbox/${uid}`);
  if (out.status === "sent") return { done: `Reply sent to ${original.fromEmail}.` };
  if (out.status === "skipped") return { done: out.reason };
  return { error: out.reason };
}

/** A new email from one of the studio's addresses, logged on the person's timeline. */
export async function composeEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const from = text(form.get("from"));
  const nonce = text(form.get("nonce"));
  const to = text(form.get("to")).toLowerCase();
  const subject = text(form.get("subject"));
  const body = text(form.get("body"));
  const contact = text(form.get("contact_id"));
  if (!KEY_RE.test(from)) return { error: "Choose the address to send from." };
  if (!isUuid(nonce)) return { error: "Reload the page and try again." };
  if (!EMAIL_RE.test(to) || to.length > 254) return { error: "Enter one valid email address." };
  if (!subject || subject.length > 300) return { error: "Write a subject (up to 300 characters)." };
  if (!body || body.length > 50000) return { error: "Write a message (up to 50,000 characters)." };
  let contactId: string | null = null;
  if (contact && isUuid(contact)) {
    const { data } = await g.admin.from("contacts").select("id, email").eq("id", contact).maybeSingle();
    if (data && data.email === to) contactId = data.id as string;
  }
  const out = await sendZoho(g.admin, {
    identityKey: from, to, subject, text: body, idempotencyKey: `zoho-out:${nonce}`, contactId, sentByName: g.me.fullName,
  });
  if (out.status === "sent") redirect(`/communications?tab=history&sent=1`);
  if (out.status === "skipped") return { done: out.reason };
  return { error: out.reason };
}

/** Makes the sender of an inbox message a contact, and links the message to them. */
export async function addSenderAsContact(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  if (!(await dbCheck(null, "contacts", "edit"))) return { error: "You need Edit access to Contacts." };
  const admin = createAdminClient();
  if (!admin) return { error: "Server key missing on this deployment." };
  const uid = Number(text(form.get("uid")));
  const m = await readMessage(uid);
  if (!m || !EMAIL_RE.test(m.fromEmail)) return { error: "The message's sender couldn't be read." };
  const name = (m.from && m.from !== m.fromEmail ? m.from : m.fromEmail.split("@")[0]).slice(0, 200);
  const { supabase } = await loadSession();
  const { error } = await supabase.from("contacts").insert({ full_name: name, email: m.fromEmail, category: "inquiry", tags: ["zoho-inbox"] });
  if (error && error.code !== "23505") return { error: "Couldn't add the contact." };
  await fileInbound(admin, m);
  revalidatePath(`/communications/inbox/${uid}`);
  return { done: error ? "They're already a contact; the message is now on their timeline." : "Added as a contact, with this message on their timeline." };
}

/** Owner: records what was checked in Zoho and Brevo for one sender address. */
export async function saveSender(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  if (!me.isOwner) return { error: "Only the owner can change sender settings." };
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const key = text(form.get("key"));
  const kind = text(form.get("zoho_kind"));
  const notes = text(form.get("notes")).slice(0, 2000);
  if (!KEY_RE.test(key)) return { error: "Unknown sender." };
  if (!["unverified", "alias", "group", "forwarding", "mailbox"].includes(kind)) return { error: "Choose what the address is in Zoho." };
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("email_identities").update({
    zoho_kind: kind, brevo_verified: form.get("brevo_verified") === "on", zoho_send_as: form.get("zoho_send_as") === "on", notes: notes || null,
  }).eq("key", key).select("address");
  if (error || !data?.length) return { error: "Couldn't save." };
  revalidatePath("/settings/senders");
  return { done: `Saved ${data[0].address}.` };
}
