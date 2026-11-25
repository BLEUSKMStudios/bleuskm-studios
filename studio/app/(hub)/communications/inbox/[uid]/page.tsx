import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { readMessage, zohoConfigured } from "@/lib/hub/zoho";
import { aliasFor, quoteOriginal } from "@/lib/hub/comms";
import { commsSendBlockReason, writeBlockReason } from "@/lib/hub/env";
import { addSenderAsContact, replyToMessage } from "@/lib/hub/comms-actions";
import { contactForEmail, fileInbound } from "@/lib/hub/zoho-send";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { FromSelect, loadSenders } from "@/components/hub/FromSelect";

export default async function InboxMessage({ params }: { params: Promise<{ uid: string }> }) {
  const { me } = await hubContext();
  if (!me.isOwner && !(await dbCheck(null, "communications", "view"))) return <NoAccess what="the studio inbox" />;
  if (!zohoConfigured()) return <NoAccess what="the studio inbox (Zoho Mail isn't connected yet)" />;
  const uid = Number((await params).uid);
  const m = await readMessage(uid);
  if (!m) return <NoAccess what="this message" />;

  // Filed in Studio OS once, on the sender's timeline when they're a contact.
  const admin = createAdminClient();
  // A read-only deployment (Preview) only looks the sender up.
  const filed = !admin ? { id: null, contactId: null }
    : writeBlockReason() ? { id: null, contactId: (await contactForEmail(admin, m.fromEmail))?.id ?? null }
    : await fileInbound(admin, m);
  const { supabase } = await loadSession();
  const [canReply, canContacts, canAddContact, senders, contactRes, repliesRes] = await Promise.all([
    me.isOwner ? true : dbCheck(null, "communications", "edit"),
    me.isOwner ? true : dbCheck(null, "contacts", "view"),
    me.isOwner ? true : dbCheck(null, "contacts", "edit"),
    loadSenders(supabase),
    filed.contactId ? supabase.from("contacts").select("id, full_name, category").eq("id", filed.contactId).maybeSingle() : Promise.resolve({ data: null }),
    m.messageId ? supabase.from("comm_messages").select("id, from_address, status, sent_by_name, sent_at, created_at, error").eq("thread_key", m.messageId).eq("direction", "outbound").order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const contact = contactRes.data as { id: string; full_name: string; category: string } | null;
  const replies = (repliesRes.data ?? []) as { id: string; from_address: string | null; status: string; sent_by_name: string | null; sent_at: string | null; created_at: string; error: string | null }[];
  const blocked = commsSendBlockReason();
  const aliasAddr = aliasFor(m.to) ?? "studio@bleuskm.com";
  const defaultKey = senders.find((s) => s.address === aliasAddr && s.zoho_send_as)?.key ?? senders.find((s) => s.zoho_send_as)?.key ?? "studio";

  return (
    <>
      <PageHead title={m.subject} lead={<><Link className="link" href="/communications?tab=inbox">Inbox</Link> · from {m.from} {m.fromEmail && `<${m.fromEmail}>`}</>} />
      <section className="panel">
        <dl className="facts">
          <div className="fact"><dt>From</dt><dd>{m.from} {m.fromEmail && <a className="link" href={`mailto:${m.fromEmail}`}>{m.fromEmail}</a>}</dd></div>
          <div className="fact"><dt>To</dt><dd>{m.to}</dd></div>
          <div className="fact"><dt>Received</dt><dd><LocalTime iso={m.date} /></dd></div>
          <div className="fact" data-testid="sender-contact">
            <dt>Contact</dt>
            <dd>
              {filed.contactId
                ? (canContacts && contact ? <Link className="link" href={`/contacts/${contact.id}`}>{contact.full_name}</Link> : "On file")
                : <span className="small">Not a contact yet</span>}
              {filed.id && <span className="small block">Filed in Studio OS{filed.contactId ? ", on their timeline" : ""}.</span>}
            </dd>
          </div>
        </dl>
        {!filed.contactId && canAddContact && m.fromEmail && (
          <HubForm action={addSenderAsContact} className="inline-form">
            <input type="hidden" name="uid" value={String(uid)} />
            <Submit quiet busy="Adding…">Add {m.fromEmail} as a contact</Submit>
          </HubForm>
        )}
        <div className="mail-body">{m.text || "(This message has no plain-text version.)"}</div>
      </section>

      {replies.length > 0 && (
        <section className="panel">
          <h2>Replies from Studio OS</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>From</th><th>By</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {replies.map((r) => (
                  <tr key={r.id}>
                    <td>{r.from_address}</td>
                    <td>{r.sent_by_name ?? "—"}</td>
                    <td><span className={`tag tag-sm ${r.status === "sent" ? "tone-good" : r.status === "failed" ? "tone-bad" : "tone-muted"}`}>{r.status}</span>{r.error && <span className="small block">{r.error}</span>}</td>
                    <td><LocalTime iso={r.sent_at ?? r.created_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canReply && (
        <section className="panel">
          <h2>Reply</h2>
          {blocked && <p className="msg">{blocked}</p>}
          <HubForm action={replyToMessage}>
            <input type="hidden" name="uid" value={String(uid)} />
            <input type="hidden" name="nonce" value={randomUUID()} />
            <FromSelect senders={senders} defaultKey={defaultKey} />
            <label className="field wide">
              <span>Message</span>
              <textarea name="body" rows={10} defaultValue={quoteOriginal(m.text, m.fromEmail || m.from, m.date)} maxLength={50000} />
            </label>
            <div className="wide form-actions"><Submit busy="Sending…">Send reply</Submit></div>
          </HubForm>
        </section>
      )}
    </>
  );
}
