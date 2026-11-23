import Link from "next/link";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { readMessage, zohoConfigured } from "@/lib/hub/zoho";
import { ALIASES, aliasFor, quoteOriginal } from "@/lib/hub/comms";
import { commsSendBlockReason } from "@/lib/hub/env";
import { replyToMessage } from "@/lib/hub/comms-actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";
import { HubForm, Submit } from "@/components/hub/HubForm";

export default async function InboxMessage({ params }: { params: Promise<{ uid: string }> }) {
  const { me } = await hubContext();
  if (!me.isOwner && !(await dbCheck(null, "communications", "view"))) return <NoAccess what="the studio inbox" />;
  if (!zohoConfigured()) return <NoAccess what="the studio inbox (Zoho Mail isn't connected yet)" />;
  const uid = Number((await params).uid);
  const m = await readMessage(uid);
  if (!m) return <NoAccess what="this message" />;
  const canReply = me.isOwner || (await dbCheck(null, "communications", "edit"));
  const blocked = commsSendBlockReason();
  const alias = aliasFor(m.to) ?? "studio@bleuskm.com";
  return (
    <>
      <PageHead title={m.subject} lead={<><Link className="link" href="/communications?tab=inbox">Inbox</Link> · from {m.from} {m.fromEmail && `<${m.fromEmail}>`}</>} />
      <section className="panel">
        <dl className="facts">
          <div className="fact"><dt>From</dt><dd>{m.from} {m.fromEmail && <a className="link" href={`mailto:${m.fromEmail}`}>{m.fromEmail}</a>}</dd></div>
          <div className="fact"><dt>To</dt><dd>{m.to}</dd></div>
          <div className="fact"><dt>Received</dt><dd><LocalTime iso={m.date} /></dd></div>
        </dl>
        <div className="mail-body">{m.text || "(This message has no plain-text version.)"}</div>
      </section>
      {canReply && (
        <section className="panel">
          <h2>Reply</h2>
          {blocked && <p className="msg">{blocked}</p>}
          <HubForm action={replyToMessage}>
            <input type="hidden" name="uid" value={String(uid)} />
            <label className="field wide">
              <span>Send from</span>
              <select name="from" defaultValue={alias}>
                {ALIASES.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
              </select>
            </label>
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
