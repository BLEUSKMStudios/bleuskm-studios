"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { dbCheck } from "./data.ts";
import { readMessage, sendReply } from "./zoho.ts";
import { replySubject } from "./comms.ts";
import { writeBlockReason } from "./env.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Replies to one inbox message through Zoho. Off unless the owner switched sending on. */
export async function replyToMessage(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  if (!(await dbCheck(null, "communications", "edit"))) return { error: "You need Studio-level Edit access to Communications to reply." };
  const uid = Number(text(form.get("uid")));
  const from = text(form.get("from")).toLowerCase();
  const body = text(form.get("body"));
  if (!body || body.length > 50000) return { error: "Write a reply (up to 50,000 characters)." };
  const original = await readMessage(uid);
  if (!original || !original.fromEmail) return { error: "The original message couldn't be found." };
  const subject = replySubject(original.subject);
  const outcome = await sendReply({ from, to: original.fromEmail, subject, text: body, inReplyTo: original.messageId });
  if (outcome.status === "blocked") return { error: outcome.reason };
  const { supabase } = await loadSession();
  await supabase.from("comm_messages").insert({
    production_id: null, direction: "outbound", channel: "zoho", from_address: from, to_addresses: original.fromEmail,
    subject, body, status: outcome.status === "sent" ? "sent" : "failed", sent_by_name: me.fullName,
    sent_at: new Date().toISOString(), provider_id: outcome.status === "sent" ? outcome.id : null,
  });
  revalidatePath("/communications");
  return outcome.status === "sent" ? { done: `Reply sent to ${original.fromEmail}.` } : { error: outcome.reason };
}
