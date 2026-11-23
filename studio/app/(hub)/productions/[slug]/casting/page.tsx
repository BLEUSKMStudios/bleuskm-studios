import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { PickAll, PickBox, PickedInputs, SelectionProvider } from "@/components/hub/Selection";
import { bulkUpdate, sendEmails } from "@/lib/hub/casting-actions";
import { APP_COLS, castingAccess, callsAndRoles, templatesFor, type Application } from "@/lib/hub/casting-data";
import { APP_STATUSES, APP_STATUS_LABEL, CALL_STATUS_LABEL, formatStudioTime, isOneOf } from "@/lib/hub/casting-core";

type Search = { role?: string; status?: string; q?: string; call?: string };

export default async function CastingHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { p, canView, canEdit } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canView) return <NoAccess what={`Casting on ${p.title}`} />;
  const base = `/productions/${p.slug}/casting`;
  const { supabase } = await loadSession();
  const [{ calls, roles }, templates, { data: appRows }, { data: matRows }] = await Promise.all([
    callsAndRoles(p.id),
    templatesFor(p.id),
    supabase.from("casting_applications").select(APP_COLS).eq("production_id", p.id).order("submitted_at", { ascending: false }).limit(2000),
    supabase.from("casting_materials").select("application_id, kind").eq("production_id", p.id).limit(10000),
  ]);
  const all = (appRows ?? []) as Application[];
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const headshots = new Set((matRows ?? []).filter((m) => m.kind === "headshot").map((m) => m.application_id as string));
  const matCount = new Map<string, number>();
  for (const m of matRows ?? []) matCount.set(m.application_id as string, (matCount.get(m.application_id as string) ?? 0) + 1);

  const q = (sp.q ?? "").trim().toLowerCase();
  const apps = all.filter((a) =>
    (!sp.role || a.role_id === sp.role) &&
    (!sp.call || a.call_id === sp.call) &&
    (!sp.status || !isOneOf(APP_STATUSES, sp.status) || a.status === sp.status) &&
    (!q || a.full_name.toLowerCase().includes(q) || a.email.includes(q) || (a.location ?? "").toLowerCase().includes(q)));

  const byStatus = new Map<string, number>();
  for (const a of all) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  const byRole = new Map<string, number>();
  for (const a of all) byRole.set(a.role_id, (byRole.get(a.role_id) ?? 0) + 1);

  return (
    <>
      <PageHead title="Casting" lead={<Link className="link" href={`/productions/${p.slug}`}>{p.title}</Link>}>
        {canEdit && <Link className="btn btn-inline" href={`${base}/calls/new`}>New casting call</Link>}
        <Link className="btn btn-quiet btn-inline" href={`${base}/templates`}>Email templates</Link>
      </PageHead>

      <section className="panel">
        <h2>Casting calls</h2>
        {calls.length === 0 ? (
          <p className="small">No casting calls yet.{canEdit ? " Create one to add roles and open submissions on bleuskm.com." : ""}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Call</th><th>Status</th><th>Deadline</th><th>Roles</th><th>Applicants</th></tr></thead>
              <tbody>
                {calls.map((c) => {
                  const rs = roles.filter((r) => r.call_id === c.id);
                  return (
                    <tr key={c.id}>
                      <th><Link href={`${base}/calls/${c.id}`}>{c.title}</Link></th>
                      <td><span className={`tag tag-call-${c.status}`}>{CALL_STATUS_LABEL[c.status]}</span></td>
                      <td className="nowrap">{c.deadline ? formatStudioTime(c.deadline) : "None"}</td>
                      <td>{rs.map((r) => r.name).join(", ") || "None yet"}</td>
                      <td>{all.filter((a) => a.call_id === c.id).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SelectionProvider>
      <section className="panel">
        <h2>Applicants ({all.length})</h2>
        <div className="seg" style={{ marginBottom: 12 }}>
          <Link className={`chip${!sp.status ? " on" : ""}`} href={{ pathname: base, query: { ...sp, status: undefined } }}>All {all.length}</Link>
          {APP_STATUSES.filter((s) => byStatus.get(s)).map((s) => (
            <Link key={s} className={`chip${sp.status === s ? " on" : ""}`} href={{ pathname: base, query: { ...sp, status: s } }}>
              {APP_STATUS_LABEL[s]} {byStatus.get(s)}
            </Link>
          ))}
        </div>
        <form className="inline-form" method="get" style={{ marginBottom: 14 }}>
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <label className="field"><span>Role</span>
            <select name="role" defaultValue={sp.role ?? ""}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({byRole.get(r.id) ?? 0})</option>)}
            </select>
          </label>
          <label className="field"><span>Search</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or city" /></label>
          <button className="btn btn-quiet btn-inline" type="submit">Filter</button>
        </form>

        {apps.length === 0 ? <p className="small">No applicants match.</p> : (
          <>
            {canEdit && <p className="small">Tick applicants, then change their status or email them below.</p>}
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{canEdit && <th><PickAll ids={apps.map((a) => a.id)} /></th>}<th>Name</th><th>Role</th><th>Status</th><th>Rating</th><th>Location</th><th>Materials</th><th>Submitted</th></tr></thead>
                <tbody>
                  {apps.map((a) => (
                    <tr key={a.id}>
                      {canEdit && <td><PickBox id={a.id} label={`Select ${a.full_name}`} /></td>}
                      <th><Link href={`${base}/applicants/${a.id}`}>{a.full_name}</Link><div className="small">{a.email}</div></th>
                      <td>{roleName.get(a.role_id) ?? ""}</td>
                      <td><span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span></td>
                      <td>{a.rating ? "★".repeat(a.rating) : ""}</td>
                      <td>{a.location ?? ""}{a.age ? <div className="small">Age {a.age}</div> : null}</td>
                      <td>{matCount.get(a.id) ?? 0}{!headshots.has(a.id) && <div className="small">no headshot file</div>}</td>
                      <td className="nowrap small">{formatStudioTime(a.submitted_at)}{a.access_code ? <div>Early access: {a.access_code}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {canEdit && apps.length > 0 && (
        <div className="cards">
          <section className="panel">
            <h2>Change status of ticked applicants</h2>
            <BulkStatus productionId={p.id} />
          </section>
          <section className="panel">
            <h2>Email ticked applicants</h2>
            <BulkEmail productionId={p.id} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
          </section>
        </div>
      )}
      </SelectionProvider>
    </>
  );
}

function BulkStatus({ productionId }: { productionId: string }) {
  return (
    <HubForm action={bulkUpdate} className="inline-form">
      <PickedInputs />
      <input type="hidden" name="production_id" value={productionId} />
      <label className="field"><span>New status</span>
        <select name="bulk_status" defaultValue="reviewing">
          {APP_STATUSES.map((s) => <option key={s} value={s}>{APP_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <Submit>Apply</Submit>
    </HubForm>
  );
}

function BulkEmail({ productionId, templates }: { productionId: string; templates: { id: string; name: string }[] }) {
  return (
    <HubForm action={sendEmails} className="action-form" confirm="Send this email to every ticked applicant now?">
      <PickedInputs />
      <input type="hidden" name="production_id" value={productionId} />
      <label className="field"><span>Template</span>
        <select name="template_id" required defaultValue="">
          <option value="" disabled>Choose a template…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="small"><input type="checkbox" name="apply_status" defaultChecked /> Also move each person to the template's status</label>
      <p className="small">Each email is personalised (first name, role, film, their next session) and sent from casting@bleuskm.com. Edit wording under Email templates.</p>
      <div><Submit busy="Sending…">Send emails</Submit></div>
    </HubForm>
  );
}
