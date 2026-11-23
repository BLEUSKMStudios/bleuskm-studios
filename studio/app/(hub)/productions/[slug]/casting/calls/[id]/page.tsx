import Link from "next/link";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { deleteRole, saveCall, saveRole } from "@/lib/hub/casting-actions";
import { castingAccess, callsAndRoles } from "@/lib/hub/casting-data";
import { CALL_STATUS_LABEL, ROLE_STATUS_LABEL, formatStudioTime } from "@/lib/hub/casting-core";
import { isUuid } from "@/lib/sections";
import { CallFields, RoleFields } from "../../CallFields";

export default async function CallPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { p, canView, canEdit } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canView || !isUuid(id)) return <NoAccess what={`Casting on ${p.title}`} />;
  const { calls, roles: allRoles } = await callsAndRoles(p.id);
  const c = calls.find((x) => x.id === id);
  if (!c) return <NoAccess what="this casting call" />;
  const roles = allRoles.filter((r) => r.call_id === c.id);
  const base = `/productions/${p.slug}/casting`;
  const live = c.status === "open" && (!c.opens_at || c.opens_at <= new Date().toISOString()) && (!c.deadline || c.deadline > new Date().toISOString());
  return (
    <>
      <PageHead title={c.title} lead={<Link className="link" href={base}>{p.title} · Casting</Link>}>
        <Link className="btn btn-quiet btn-inline" href={`${base}?call=${c.id}`}>See applicants</Link>
      </PageHead>
      <p className={`msg${live ? "" : " error"}`}>
        {live ? "Taking submissions now on bleuskm.com/casting" : `Not taking submissions: ${CALL_STATUS_LABEL[c.status]}`}
        {c.deadline ? ` · Deadline ${formatStudioTime(c.deadline)}` : " · No deadline set"}
        {` · Website key: ${c.public_slug}`}
      </p>

      {c.early_access_codes.length > 0 && (
        <section className="panel">
          <h2>Early-access links</h2>
          <p className="small">Share a link privately. It lets people apply before {c.opens_at ? formatStudioTime(c.opens_at) : "the opening time"}, while the status is Open. Each application records which code was used.</p>
          <ul className="plain">
            {c.early_access_codes.map((code) => (
              <li key={code}><strong>{code}</strong>: <code>https://bleuskm.com/casting?access={encodeURIComponent(code)}#{c.public_slug}</code></li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Roles</h2>
        {roles.length === 0 && <p className="small">No roles yet. Add at least one open role before opening the call.</p>}
        {roles.map((r) => (
          <details key={r.id} className="panel" style={{ background: "#101010" }}>
            <summary><strong>{r.name}</strong> <span className="small">{r.role_type ?? ""} · {ROLE_STATUS_LABEL[r.status]}{r.age_min || r.age_max ? ` · ${r.age_min ?? "?"}–${r.age_max ?? "?"}` : ""}</span></summary>
            {canEdit ? (
              <>
                <HubForm action={saveRole}><RoleFields r={r} callId={c.id} productionId={p.id} nextSort={r.sort} /></HubForm>
                <HubForm action={deleteRole} className="action-form" confirm={`Remove the role ${r.name}? Roles with applicants can't be removed.`}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="production_id" value={p.id} />
                  <div><Submit quiet busy="Removing…">Remove role</Submit></div>
                </HubForm>
              </>
            ) : (
              <div className="small" style={{ whiteSpace: "pre-wrap" }}>{[r.summary, r.description, r.requirements].filter(Boolean).join("\n\n")}</div>
            )}
          </details>
        ))}
        {canEdit && (
          <details className="panel" style={{ background: "#101010" }} open={roles.length === 0}>
            <summary><strong>Add a role</strong></summary>
            <HubForm action={saveRole} resetOnDone><RoleFields callId={c.id} productionId={p.id} nextSort={(roles.at(-1)?.sort ?? 0) + 1} /></HubForm>
          </details>
        )}
      </section>

      <section className="panel">
        <h2>Call details</h2>
        {canEdit ? (
          <HubForm action={saveCall}><CallFields c={c} productionId={p.id} defaultSlug={c.public_slug} returnTo={base} /></HubForm>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>{[c.summary, c.description, c.requirements, c.instructions].filter(Boolean).join("\n\n")}</div>
        )}
      </section>
    </>
  );
}
