import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { isOwnerHere } from "@/lib/hub/owner";
import { describeAudit, isSetupNoise, type AuditRow } from "@/lib/hub/audit";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Audit log · BLEUSKM Studio OS" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  const before = Number((await searchParams).before);
  const { supabase } = await loadSession();
  let q = supabase.from("audit_log").select("id, at, actor_id, action, table_name, production_id, old_row, new_row").order("id", { ascending: false }).limit(PAGE);
  if (Number.isSafeInteger(before) && before > 0) q = q.lt("id", before);
  const [{ data: rows }, { data: people }, { data: prods }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name"),
    supabase.from("productions").select("id, title"),
  ]);
  const names = {
    people: new Map((people ?? []).map((p) => [p.id as string, p.full_name as string])),
    productions: new Map((prods ?? []).map((p) => [p.id as string, p.title as string])),
  };
  const list = ((rows ?? []) as AuditRow[]).filter((r) => !isSetupNoise(r));
  const last = rows && rows.length === PAGE ? (rows[rows.length - 1].id as number) : null;
  return (
    <>
      <PageHead title="Audit log" lead={<><Link className="link" href="/settings">Settings &amp; Administration</Link> · Newest first. Entries are written by the database and can't be edited.</>} />
      <section className="panel">
        {list.length === 0 ? <p className="small">Nothing recorded yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap"><LocalTime iso={r.at} /></td>
                    <td>{r.actor_id ? names.people.get(r.actor_id) ?? "Removed user" : "System"}</td>
                    <td>{describeAudit(r, names)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {last && <p className="small" style={{ marginTop: 12 }}><Link className="link" href={`/settings/audit?before=${last}`}>Older entries</Link></p>}
      </section>
    </>
  );
}
