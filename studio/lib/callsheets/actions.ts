"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "@/lib/hub/data";
import { writeBlockReason } from "@/lib/hub/env";
import { hashToken, newToken, publicBase } from "@/lib/hub/links";
import { sendTransactional } from "@/lib/hub/mailer";
import { firstName } from "@/lib/hub/templates";
import { callFor, dateLabel, identityForTeam, pdfName, timeLabel } from "./sheet.ts";
import { buildCallSheetPdf } from "./pdf.ts";
import { loadSheet } from "./data.ts";

type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

async function guard(form: FormData) {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked } as const;
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown call sheet." } as const;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("call_sheets").select("id, production_id, version").eq("id", id).maybeSingle();
  if (!data) return { error: "Unknown call sheet." } as const;
  if (!(await dbCheck(data.production_id as string, "scheduling", "edit"))) return { error: "You need Edit access to Scheduling on this production." } as const;
  return { supabase, sheet: data as { id: string; production_id: string; version: number } } as const;
}

/** Adds everyone confirmed on the production's roster (that you can see) who isn't on the sheet yet. */
export async function importRoster(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if ("error" in g) return { error: g.error };
  const { supabase, sheet } = g;
  const [{ data: team }, { data: have }] = await Promise.all([
    supabase.from("production_team").select("id, full_name, position, team, email").eq("production_id", sheet.production_id).eq("status", "confirmed").limit(500),
    supabase.from("call_sheet_entries").select("team_id").eq("call_sheet_id", sheet.id),
  ]);
  const present = new Set((have ?? []).map((h) => h.team_id as string | null).filter(Boolean));
  const add = (team ?? []).filter((t) => !present.has(t.id as string));
  if (!add.length) return { done: (team ?? []).length ? "Everyone confirmed on the roster is already on this sheet." : "Nobody on this production's roster is confirmed yet (or you can't see the Crew roster)." };
  const { error } = await supabase.from("call_sheet_entries").insert(add.map((t, i) => ({
    call_sheet_id: sheet.id, team_id: t.id, full_name: t.full_name, position: t.position, team: t.team, email: t.email ?? null, sort: 100 + i,
  })));
  if (error) return { error: "Couldn't add the roster." };
  revalidatePath(`/call-sheets/${sheet.id}`);
  return { done: `Added ${add.length} ${add.length === 1 ? "person" : "people"} from the roster.` };
}

function sheetEmail(o: { name: string; film: string; title: string; date: string; call: string; location: string | null; link: string; version: number }) {
  return [
    `Hi ${firstName(o.name)},`,
    "",
    o.version > 1 ? `The call sheet for ${o.film}, ${o.title} (${o.date}) has been UPDATED (version ${o.version}). Please use this one.` : `Here's your call sheet for ${o.film}, ${o.title} (${o.date}).`,
    "",
    `Your call time: ${o.call || "to be confirmed"}`,
    o.location ? `Location: ${o.location}` : "",
    "",
    "The full call sheet is attached as a PDF, and on your personal page (please confirm there that you've got it):",
    o.link,
    "",
    "Questions? Just reply to this email.",
    "",
    "BLEUSKM Studios",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** Sends the current call sheet (a new version) to everyone on it with an email. */
export async function sendCallSheet(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if ("error" in g) return { error: g.error };
  const { supabase, sheet: row } = g;
  const me = await requireSignedIn();
  const admin = createAdminClient();
  if (!admin) return { error: "Email isn't set up on this deployment (server key missing)." };
  const loaded = await loadSheet(supabase, row.id);
  if (!loaded) return { error: "Unknown call sheet." };
  const { sheet, raw } = loaded;
  const recipients = raw.entries.filter((e) => typeof e.email === "string" && EMAIL_RE.test(e.email as string));
  if (!recipients.length) return { error: "Nobody on this sheet has an email address yet. Add emails to the call times (or import the roster)." };
  if (!sheet.shootDate) return { error: "Set the shoot date first." };

  const version = (row.version ?? 0) + 1;
  const { data: bumped, error: vErr } = await supabase.from("call_sheets").update({ version, status: "sent", last_sent_at: new Date().toISOString() }).eq("id", row.id).eq("version", row.version).select("id");
  if (vErr || !bumped?.length) return { error: "Couldn't start the send. Try again." };
  // Earlier links now point at an old version: close them.
  await supabase.from("call_sheet_sends").update({ status: "replaced" }).eq("call_sheet_id", row.id).lt("version", version).in("status", ["sent", "opened"]);
  sheet.version = version;

  const h = await headers();
  const base = publicBase(process.env, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const date = dateLabel(sheet.shootDate);
  let sent = 0;
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of recipients) {
    const email = (e.email as string).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const entry = sheet.entries.find((x) => x.id === e.id) ?? null;
    const token = newToken();
    const identity = identityForTeam(String(e.team ?? "crew"));
    const { data: send, error } = await supabase.from("call_sheet_sends").insert({
      call_sheet_id: row.id, entry_id: e.id, team_id: e.team_id ?? null, version, recipient_name: e.full_name, recipient_email: email,
      identity_key: identity, token_hash: hashToken(token),
    }).select("id").single();
    if (error || !send) { problems.push(`${e.full_name}: couldn't prepare`); continue; }
    const pdf = await buildCallSheetPdf(sheet, { highlightEntryId: e.id as string });
    const { data: contact } = e.team_id ? await supabase.from("production_team").select("contact_id").eq("id", e.team_id).maybeSingle() : { data: null };
    const out = await sendTransactional(admin, {
      identityKey: identity, to: { email, name: e.full_name as string },
      subject: `${version > 1 ? "UPDATED " : ""}Call sheet: ${sheet.production} · ${sheet.title} · ${date}`,
      body: sheetEmail({ name: e.full_name as string, film: sheet.production, title: sheet.title, date, call: timeLabel(callFor(sheet, entry)), location: sheet.location, link: `${base}/cs/${token}`, version }),
      idempotencyKey: `callsheet:${row.id}:v${version}:${email}`, contactId: (contact?.contact_id as string | null) ?? null,
      productionId: row.production_id, section: "scheduling", templateKey: "call_sheet", related: { table: "call_sheet_sends", id: send.id as string },
      sentByName: me.fullName, activityKind: "call_sheet.email", activitySummary: `Call sheet v${version} emailed to ${email}`,
      attachments: [{ name: pdfName(sheet), content: Buffer.from(pdf).toString("base64") }],
    });
    if (out.status === "sent") {
      await supabase.from("call_sheet_sends").update({ message_id: out.messageId }).eq("id", send.id);
      sent++;
    } else {
      await supabase.from("call_sheet_sends").update({ status: "cancelled" }).eq("id", send.id);
      problems.push(`${e.full_name}: ${out.reason}`);
    }
  }
  revalidatePath(`/call-sheets/${row.id}`);
  if (!sent) return { error: `Nothing was sent. ${problems.slice(0, 3).join("; ")}` };
  return { done: `Version ${version} sent to ${sent} ${sent === 1 ? "person" : "people"}.${problems.length ? ` Not sent: ${problems.slice(0, 5).join("; ")}.` : ""}` };
}
