import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { castingOverview, type CallKind } from "@/lib/hub/casting-data";
import { APP_STATUSES, APP_STATUS_LABEL, CALL_STATUS_LABEL, formatStudioTime, isOneOf } from "@/lib/hub/casting-core";
import { ProductionChips, withQuery } from "./ProductionChips";
import type { WorkspaceSearch } from "@/components/hub/WorkspaceView";

/**
 * Cast or crew applications from every production, in one list. Status
 * changes, bulk updates and emails happen on each production's applicant
 * pages, which this list links to. The public submission forms are not
 * touched by anything here.
 */
export async function ApplicationsView({ kind, search, listHref }: { kind: CallKind; search: WorkspaceSearch; listHref: string }) {
  const { productions } = await hubContext();
  const data = await castingOverview();
  if (data.failed) return <p className="msg error" role="alert">Applications couldn&apos;t be loaded. Refresh to try again.</p>;

  const production = productions.some((p) => p.id === search.production) ? search.production : undefined;
  const calls = data.calls.filter((c) => data.kindOfCall.get(c.id) === kind && (!production || c.production_id === production));
  const callIds = new Set(calls.map((c) => c.id));
  const roles = data.roles.filter((r) => callIds.has(r.call_id));
  const all = data.apps.filter((a) => callIds.has(a.call_id));
  const q = (search.q ?? "").trim().toLowerCase();
  const apps = all.filter((a) =>
    (!search.call || a.call_id === search.call) &&
    (!search.role || a.role_id === search.role) &&
    (!search.status || !isOneOf(APP_STATUSES, search.status) || a.status === search.status) &&
    (!q || a.full_name.toLowerCase().includes(q) || a.email.includes(q) || (a.location ?? "").toLowerCase().includes(q)));

  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const callById = new Map(data.calls.map((c) => [c.id, c]));
  const slugOf = new Map(productions.map((p) => [p.id, p.slug]));
  const titleOf = new Map(productions.map((p) => [p.id, p.title]));
  const byStatus = new Map<string, number>();
  for (const a of all) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  const here = (extra: Record<string, string | undefined>) => withQuery(listHref, { production, call: search.call, role: search.role, status: search.status, q: search.q, ...extra });
  const word = kind === "crew" ? "crew" : "cast";
  const positionWord = kind === "crew" ? "Position" : "Role";

  return (
    <>
      <p className="lead-line">
        {kind === "crew"
          ? "Applications to crew calls (website addresses ending in -crew). Emails to these applicants come from crew@bleuskm.com."
          : "Applications to casting calls. Emails to these applicants come from casting@bleuskm.com."}
      </p>
      <ProductionChips productions={productions} current={production} href={(p) => withQuery(listHref, { production: p })} />

      <section className="panel">
        <h2>{kind === "crew" ? "Crew calls" : "Casting calls"}</h2>
        {calls.length === 0 ? <p className="small">No {word} calls yet. Create one from a production&apos;s Casting page.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Call</th><th scope="col">Production</th><th scope="col">Status</th><th scope="col">Deadline</th><th scope="col">Website key</th><th scope="col">Applicants</th></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <th scope="row"><Link href={`/productions/${slugOf.get(c.production_id)}/casting/calls/${c.id}`}>{c.title}</Link></th>
                    <td>{titleOf.get(c.production_id) ?? ""}</td>
                    <td><span className={`tag tag-call-${c.status}`}>{CALL_STATUS_LABEL[c.status]}</span></td>
                    <td className="nowrap">{c.deadline ? formatStudioTime(c.deadline) : "None"}</td>
                    <td><code>{c.public_slug}</code></td>
                    <td><Link className="link" href={here({ call: c.id, role: undefined })}>{all.filter((a) => a.call_id === c.id).length}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{kind === "crew" ? "Crew applicants" : "Cast applicants"} ({all.length})</h2>
        <div className="seg" style={{ marginBottom: 12 }}>
          <Link className={`chip${!search.status ? " on" : ""}`} href={here({ status: undefined })}>All {all.length}</Link>
          {APP_STATUSES.filter((s) => byStatus.get(s)).map((s) => (
            <Link key={s} className={`chip${search.status === s ? " on" : ""}`} href={here({ status: s })}>{APP_STATUS_LABEL[s]} {byStatus.get(s)}</Link>
          ))}
        </div>
        <form className="inline-form" method="get" style={{ marginBottom: 14 }}>
          <input type="hidden" name="tab" value={kind} />
          {production && <input type="hidden" name="production" value={production} />}
          {search.status && <input type="hidden" name="status" value={search.status} />}
          <label className="field"><span>Call</span>
            <select name="call" defaultValue={search.call ?? ""}>
              <option value="">All calls</option>
              {calls.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="field"><span>{positionWord}</span>
            <select name="role" defaultValue={search.role ?? ""}>
              <option value="">All</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Search</span><input name="q" defaultValue={search.q ?? ""} placeholder="Name, email or city" /></label>
          <button className="btn btn-quiet btn-inline" type="submit">Filter</button>
        </form>
        {apps.length === 0 ? <div className="empty-state"><h3>No applicants match</h3><p className="small">{all.length ? "Try another filter." : `No ${word} applications yet.`}</p></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Name</th><th scope="col">{positionWord}</th><th scope="col">Production</th><th scope="col">Status</th><th scope="col">Rating</th><th scope="col">Location</th><th scope="col">Submitted</th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <th scope="row"><Link href={`/productions/${slugOf.get(a.production_id)}/casting/applicants/${a.id}`}>{a.full_name}</Link><div className="small">{a.email}</div></th>
                    <td>{roleName.get(a.role_id) ?? ""}<div className="small">{callById.get(a.call_id)?.title ?? ""}</div></td>
                    <td>{titleOf.get(a.production_id) ?? ""}</td>
                    <td><span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span></td>
                    <td>{a.rating ? "★".repeat(a.rating) : ""}</td>
                    <td>{a.location ?? ""}</td>
                    <td className="nowrap small">{formatStudioTime(a.submitted_at)}{a.source === "airtable" ? <div>Imported</div> : a.access_code ? <div>Early access: {a.access_code}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small" style={{ marginTop: 12 }}>To change several statuses at once or email applicants, open the production&apos;s Casting page: {[...new Set(calls.map((c) => c.production_id))].map((pid, i) => <span key={pid}>{i ? ", " : ""}<Link className="link" href={`/productions/${slugOf.get(pid)}/casting`}>{titleOf.get(pid)}</Link></span>)}.</p>
      </section>
    </>
  );
}
