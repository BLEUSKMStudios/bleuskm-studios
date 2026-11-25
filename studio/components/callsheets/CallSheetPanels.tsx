import { loadSession } from "@/lib/auth/session";
import { importRoster, sendCallSheet } from "@/lib/callsheets/actions";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { ActionForm } from "@/components/hub/ActionForm";

type Row = Record<string, unknown> & { id: string };
const STATUS: Record<string, string> = { sent: "Sent", opened: "Opened", confirmed: "Confirmed", replaced: "Replaced", cancelled: "Not sent" };

/** PDF, roster import, sending and who has confirmed. */
export async function CallSheetPanels({ row, canEdit, blocked }: { row: Row; canEdit: boolean; blocked: string | null }) {
  const { supabase } = await loadSession();
  const version = Number(row.version ?? 0);
  const [{ data: entries }, { data: sends }] = await Promise.all([
    supabase.from("call_sheet_entries").select("id, email, updated_at").eq("call_sheet_id", row.id),
    supabase.from("call_sheet_sends").select("id, recipient_name, recipient_email, status, version, sent_at, opened_at, confirmed_at").eq("call_sheet_id", row.id).order("version", { ascending: false }).order("recipient_name").limit(500),
  ]);
  const withEmail = (entries ?? []).filter((e) => e.email).length;
  const lastSent = row.last_sent_at ? new Date(String(row.last_sent_at)).getTime() : 0;
  const changed = lastSent > 0 && (new Date(String(row.updated_at)).getTime() > lastSent + 2000 || (entries ?? []).some((e) => new Date(String(e.updated_at)).getTime() > lastSent));
  const latest = (sends ?? []).filter((s) => s.version === version);
  const confirmed = latest.filter((s) => s.status === "confirmed").length;
  const older = (sends ?? []).length - latest.length;
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Call sheet {version ? `· version ${version}` : "· not sent yet"}</h2>
          <span className="row-actions">
            <a className="btn btn-inline btn-quiet" href={`/api/call-sheets/${row.id}/pdf`} target="_blank" rel="noopener noreferrer">View PDF</a>
            <a className="btn btn-inline btn-quiet" href={`/api/call-sheets/${row.id}/pdf?download=1`}>Download PDF</a>
          </span>
        </div>
        {changed && <p className="msg warn">This sheet changed after version {version} was sent. Send it again so everyone has the latest.</p>}
        <p className="small">{(entries ?? []).length} people on the sheet, {withEmail} with an email. Each person gets an email from casting@ (cast) or crew@ (everyone else) with the PDF and a personal page that shows their call time first and asks them to confirm.</p>
        {canEdit && !blocked && (
          <div className="row-actions">
            <ActionForm action={importRoster} fields={{ id: row.id }} label="Add confirmed roster" busy="Adding…" quiet />
            {withEmail > 0 && (
              <ActionForm action={sendCallSheet} fields={{ id: row.id }} label={version ? `Send updated sheet (v${version + 1})` : "Send call sheet"} busy="Sending…"
                confirm={`Email this call sheet to ${withEmail} ${withEmail === 1 ? "person" : "people"} now?`} />
            )}
          </div>
        )}
        {blocked && canEdit && <p className="small">{blocked}</p>}
      </section>
      {latest.length > 0 && (
        <section className="panel">
          <h2>Version {version} · {confirmed} of {latest.length} confirmed</h2>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Opened</th><th>Confirmed</th></tr></thead>
            <tbody>
              {latest.map((s) => (
                <tr key={s.id as string}>
                  <td>{s.recipient_name as string}</td>
                  <td>{s.recipient_email as string}</td>
                  <td><span className="tag tag-sm">{STATUS[s.status as string] ?? s.status}</span></td>
                  <td>{s.opened_at ? formatStudioTime(s.opened_at as string) : ""}</td>
                  <td>{s.confirmed_at ? formatStudioTime(s.confirmed_at as string) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {older > 0 && <p className="small">{older} earlier {older === 1 ? "send" : "sends"} of previous versions are kept on record.</p>}
        </section>
      )}
    </>
  );
}
