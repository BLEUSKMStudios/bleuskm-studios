import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { castingOverview } from "@/lib/hub/casting-data";
import { APP_STATUS_LABEL, ROLE_STATUS_LABEL, SESSION_KIND_LABEL, SESSION_STATUS_LABEL, formatStudioTime, type AppStatus } from "@/lib/hub/casting-core";
import { ProductionChips, withQuery } from "./ProductionChips";
import type { WorkspaceSearch } from "@/components/hub/WorkspaceView";

const EVALUATING: readonly AppStatus[] = ["reviewing", "shortlisted", "callback", "audition", "on_hold"];

/** The Casting workspace: cast calls only (crew calls are managed under Crew). */
export async function CastingView({ view, search, listHref }: { view: string; search: WorkspaceSearch; listHref: string }) {
  const { productions } = await hubContext();
  const data = await castingOverview();
  if (data.failed) return <p className="msg error" role="alert">Casting couldn&apos;t be loaded. Refresh to try again.</p>;
  const production = productions.some((p) => p.id === search.production) ? search.production : undefined;
  const calls = data.calls.filter((c) => data.kindOfCall.get(c.id) === "cast" && (!production || c.production_id === production));
  const callIds = new Set(calls.map((c) => c.id));
  const apps = data.apps.filter((a) => callIds.has(a.call_id));
  const appById = new Map(apps.map((a) => [a.id, a]));
  const roles = data.roles.filter((r) => callIds.has(r.call_id));
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const slugOf = new Map(productions.map((p) => [p.id, p.slug]));
  const titleOf = new Map(productions.map((p) => [p.id, p.title]));
  const applicantHref = (id: string, pid: string) => `/productions/${slugOf.get(pid)}/casting/applicants/${id}`;
  const chips = <ProductionChips productions={productions} current={production} href={(p) => withQuery(listHref, { production: p })} />;
  const prodLinks = (ids: string[]) => [...new Set(ids)].map((pid, i) => <span key={pid}>{i ? ", " : ""}<Link className="link" href={`/productions/${slugOf.get(pid)}/casting`}>{titleOf.get(pid)}</Link></span>);

  if (view === "casting-roles") {
    return (
      <>
        <p className="lead-line">Every character and role breakdown, with its call and how many people applied. Edit roles from the call&apos;s page.</p>
        {chips}
        <section className="panel">
          {roles.length === 0 ? <div className="empty-state"><h3>No roles yet</h3><p className="small">Create a casting call on a production&apos;s Casting page, then add its roles.</p></div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th scope="col">Role</th><th scope="col">Type</th><th scope="col">Ages</th><th scope="col">Call</th><th scope="col">Production</th><th scope="col">Status</th><th scope="col">Applicants</th></tr></thead>
              <tbody>{roles.map((r) => {
                const call = calls.find((c) => c.id === r.call_id)!;
                return (
                  <tr key={r.id}>
                    <th scope="row"><Link href={`/productions/${slugOf.get(r.production_id)}/casting/calls/${r.call_id}`}>{r.name}</Link>{r.summary ? <div className="small">{r.summary}</div> : null}</th>
                    <td>{r.role_type ?? ""}</td>
                    <td className="nowrap">{r.age_min ?? r.age_max ? `${r.age_min ?? "?"}–${r.age_max ?? "?"}` : ""}</td>
                    <td>{call.title}</td>
                    <td>{titleOf.get(r.production_id) ?? ""}</td>
                    <td><span className="tag tone-info">{ROLE_STATUS_LABEL[r.status]}</span></td>
                    <td><Link className="link" href={`/applications?tab=cast&role=${r.id}`}>{apps.filter((a) => a.role_id === r.id).length}</Link></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      </>
    );
  }

  if (view === "casting-auditions") {
    const sessions = data.sessions.filter((s) => appById.has(s.application_id));
    return (
      <>
        <p className="lead-line">Auditions, callbacks, chemistry reads and self-tapes. Schedule them from an applicant&apos;s page.</p>
        {chips}
        <section className="panel">
          {sessions.length === 0 ? <div className="empty-state"><h3>No auditions or callbacks yet</h3><p className="small">Open an applicant and use “Schedule a session”.</p></div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th scope="col">When</th><th scope="col">Applicant</th><th scope="col">Role</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Where</th></tr></thead>
              <tbody>{sessions.map((s) => {
                const a = appById.get(s.application_id)!;
                return (
                  <tr key={s.id}>
                    <td className="nowrap">{s.starts_at ? formatStudioTime(s.starts_at) : "Not set"}</td>
                    <th scope="row"><Link href={applicantHref(a.id, a.production_id)}>{a.full_name}</Link></th>
                    <td>{roleName.get(a.role_id) ?? ""}<div className="small">{titleOf.get(a.production_id)}</div></td>
                    <td>{SESSION_KIND_LABEL[s.kind]}</td>
                    <td><span className="tag tone-info">{SESSION_STATUS_LABEL[s.status]}</span></td>
                    <td>{s.location ?? (s.meeting_link ? "Online" : "")}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      </>
    );
  }

  if (view === "casting-evaluations") {
    const list = apps.filter((a) => EVALUATING.includes(a.status)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return (
      <>
        <p className="lead-line">Applicants under consideration (reviewing, shortlisted, callback, audition, on hold), best rated first. Rate, add notes and decide on each applicant&apos;s page.</p>
        {chips}
        <section className="panel">
          {list.length === 0 ? <div className="empty-state"><h3>No one under consideration</h3><p className="small">Move applicants to Reviewing or Shortlisted in Applications.</p></div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th scope="col">Applicant</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Rating</th><th scope="col">Production</th></tr></thead>
              <tbody>{list.map((a) => (
                <tr key={a.id}>
                  <th scope="row"><Link href={applicantHref(a.id, a.production_id)}>{a.full_name}</Link></th>
                  <td>{roleName.get(a.role_id) ?? ""}</td>
                  <td><span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span></td>
                  <td>{a.rating ? "★".repeat(a.rating) : <span className="faint">Not rated</span>}</td>
                  <td>{titleOf.get(a.production_id) ?? ""}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </>
    );
  }

  if (view === "casting-roster") {
    const offered = apps.filter((a) => a.status === "offered");
    const cast = apps.filter((a) => a.status === "cast");
    const table = (list: typeof apps) => (
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Production</th><th scope="col">Since</th></tr></thead>
        <tbody>{list.map((a) => (
          <tr key={a.id}>
            <th scope="row"><Link href={applicantHref(a.id, a.production_id)}>{a.full_name}</Link><div className="small">{a.email}</div></th>
            <td>{roleName.get(a.role_id) ?? ""}</td>
            <td>{titleOf.get(a.production_id) ?? ""}</td>
            <td className="nowrap small">{formatStudioTime(a.status_changed_at)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    );
    return (
      <>
        <p className="lead-line">Who has been offered a role and who is confirmed. Set “Offered” or “Cast” on an applicant to move them here.</p>
        {chips}
        <section className="panel">
          <h2>Confirmed cast ({cast.length})</h2>
          {cast.length ? table(cast) : <p className="small">No one confirmed yet.</p>}
        </section>
        <section className="panel">
          <h2>Offers awaiting confirmation ({offered.length})</h2>
          {offered.length ? table(offered) : <p className="small">No open offers.</p>}
        </section>
      </>
    );
  }

  // casting-comms
  const sent = data.messages.filter((m) => appById.has(m.application_id)).slice(0, 50);
  const pids = [...new Set(calls.map((c) => c.production_id))];
  return (
    <>
      <p className="lead-line">Casting emails come from casting@bleuskm.com and replies return to that inbox. Templates are kept per production.</p>
      {chips}
      <section className="panel">
        <h2>Email templates</h2>
        {pids.length === 0 ? <p className="small">Templates appear when a production has its first casting call.</p> : (
          <ul className="plain-list">
            {pids.map((pid) => (
              <li key={pid}><Link className="link" href={`/productions/${slugOf.get(pid)}/casting/templates`}>{titleOf.get(pid)}</Link> <span className="small">· {data.templates.filter((t) => t.production_id === pid).length} templates</span></li>
            ))}
          </ul>
        )}
        <p className="small">To email applicants, tick them on the production&apos;s Casting page ({prodLinks(pids)}) and choose a template.</p>
      </section>
      <section className="panel">
        <h2>Recent casting emails</h2>
        {sent.length === 0 ? <p className="small">No casting emails sent from Studio OS yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th scope="col">Sent</th><th scope="col">To</th><th scope="col">Subject</th><th scope="col">Status</th></tr></thead>
            <tbody>{sent.map((m) => {
              const a = appById.get(m.application_id)!;
              return (
                <tr key={m.id}>
                  <td className="nowrap small">{formatStudioTime(m.sent_at)}</td>
                  <th scope="row"><Link href={applicantHref(a.id, a.production_id)}>{a.full_name}</Link></th>
                  <td>{m.subject}</td>
                  <td><span className={`tag ${m.status === "sent" ? "tone-good" : "tone-bad"}`}>{m.status === "sent" ? "Sent" : "Failed"}</span></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
