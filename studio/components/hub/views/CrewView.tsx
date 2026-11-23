import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { listModule } from "@/lib/hub/module-data";
import { moduleByKey, optionLabel } from "@/lib/hub/modules";
import { castingOverview } from "@/lib/hub/casting-data";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { SetupPending } from "@/components/hub/ModuleView";
import { ProductionChips, withQuery } from "./ProductionChips";
import type { WorkspaceSearch } from "@/components/hub/WorkspaceView";

/** The Crew workspace views: onboarding and crew communications (the roster is a module tab). */
export async function CrewView({ view, search, listHref }: { view: string; search: WorkspaceSearch; listHref: string }) {
  const { me, grants, productions } = await hubContext();
  const def = moduleByKey("crew-roster")!;
  const production = productions.some((p) => p.id === search.production) ? search.production : undefined;
  const chips = <ProductionChips productions={productions} current={production} href={(p) => withQuery(listHref, { production: p })} />;
  const titleOf = new Map(productions.map((p) => [p.id, p.title]));
  const slugOf = new Map(productions.map((p) => [p.id, p.slug]));

  if (view === "crew-onboarding") {
    const { rows, error } = await listModule(def, production);
    const field = (n: string) => def.fields.find((f) => f.name === n)!;
    const confirmed = rows.filter((r) => r.status === "confirmed").length;
    const signed = rows.filter((r) => ["paperwork_signed", "guide_sent", "complete"].includes(String(r.onboarding))).length;
    const done = rows.filter((r) => r.onboarding === "complete").length;
    return (
      <>
        <p className="lead-line">Where each crew member stands: confirmation, agreement, department guide and availability. Open a name to update it.</p>
        {chips}
        {error === "setup" ? <SetupPending what="Crew" /> : error ? <p className="msg error" role="alert">The crew list couldn&apos;t be loaded. Refresh to try again.</p> : (
          <>
            <div className="stats">
              <div className="stat"><span className="stat-n">{rows.length}</span><span className="stat-l">On crew rosters</span></div>
              <div className="stat"><span className="stat-n">{confirmed}</span><span className="stat-l">Confirmed</span></div>
              <div className="stat"><span className="stat-n">{signed}</span><span className="stat-l">Agreement signed</span></div>
              <div className="stat"><span className="stat-n">{done}</span><span className="stat-l">Onboarding complete</span></div>
            </div>
            <section className="panel">
              {rows.length === 0 ? <div className="empty-state"><h3>No crew yet</h3><p className="small">Add people in “Roster & positions”.</p></div> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th scope="col">Name</th><th scope="col">Position</th><th scope="col">Confirmation</th><th scope="col">Onboarding</th><th scope="col">Availability</th><th scope="col">Production</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row"><Link href={`/crew-roster/${r.id}`}>{String(r.full_name)}</Link></th>
                      <td>{String(r.position ?? "")}{r.department ? <div className="small">{String(r.department)}</div> : null}</td>
                      <td><span className={`tag tone-${r.status === "confirmed" ? "good" : r.status === "offered" ? "warn" : "muted"}`}>{optionLabel(field("status"), r.status)}</span></td>
                      <td><span className={`tag tone-${r.onboarding === "complete" ? "good" : r.onboarding === "not_started" ? "muted" : "warn"}`}>{optionLabel(field("onboarding"), r.onboarding)}</span></td>
                      <td className="small">{String(r.availability ?? "")}</td>
                      <td>{r.production_id ? titleOf.get(r.production_id) ?? "" : ""}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          </>
        )}
      </>
    );
  }

  // crew-comms: crew calls' templates and emails (stored with casting, sent from crew@)
  if (!me.isOwner && !holdsSection(grants, "casting")) {
    return <p className="msg">Crew emails and templates are kept with the production&apos;s calls. Ask the owner for Casting access to see them.</p>;
  }
  const data = await castingOverview();
  if (data.failed) return <p className="msg error" role="alert">Crew communications couldn&apos;t be loaded. Refresh to try again.</p>;
  const crewCalls = data.calls.filter((c) => data.kindOfCall.get(c.id) === "crew" && (!production || c.production_id === production));
  const callIds = new Set(crewCalls.map((c) => c.id));
  const apps = new Map(data.apps.filter((a) => callIds.has(a.call_id)).map((a) => [a.id, a]));
  const sent = data.messages.filter((m) => apps.has(m.application_id)).slice(0, 50);
  const pids = [...new Set(crewCalls.map((c) => c.production_id))];
  return (
    <>
      <p className="lead-line">Emails to crew applicants come from crew@bleuskm.com and replies return there. Templates are kept per production; department guides and agreements are in the tabs above.</p>
      {chips}
      <section className="panel">
        <h2>Email templates</h2>
        {pids.length === 0 ? <p className="small">No crew calls yet.</p> : (
          <ul className="plain-list">
            {pids.map((pid) => <li key={pid}><Link className="link" href={`/productions/${slugOf.get(pid)}/casting/templates`}>{titleOf.get(pid)}</Link></li>)}
          </ul>
        )}
        <p className="small">To email crew applicants, use Applications → Crew applications, then the production&apos;s page to tick people and choose a template.</p>
      </section>
      <section className="panel">
        <h2>Recent crew emails</h2>
        {sent.length === 0 ? <p className="small">No crew emails sent from Studio OS yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th scope="col">Sent</th><th scope="col">To</th><th scope="col">Subject</th><th scope="col">Status</th></tr></thead>
            <tbody>{sent.map((m) => {
              const a = apps.get(m.application_id)!;
              return (
                <tr key={m.id}>
                  <td className="nowrap small">{formatStudioTime(m.sent_at)}</td>
                  <th scope="row"><Link href={`/productions/${slugOf.get(a.production_id)}/casting/applicants/${a.id}`}>{a.full_name}</Link></th>
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
