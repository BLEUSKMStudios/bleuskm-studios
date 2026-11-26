import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hubContext } from "@/lib/hub/data";
import { getRecord, listModule } from "@/lib/hub/module-data";
import { moduleByKey, optionLabel } from "@/lib/hub/modules";
import { listHrefForModule, workspaceByKey } from "@/lib/hub/workspaces";
import { writeBlockReason } from "@/lib/hub/env";
import { formatDay } from "@/lib/hub/dates";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { RecordForm } from "@/components/hub/RecordForm";
import { ModuleTable } from "@/components/hub/ModuleTable";
import { ActionForm } from "@/components/hub/ActionForm";
import { deleteModuleRecord } from "@/lib/hub/module-actions";
import { ScriptPanels } from "@/components/hub/ScriptPanels";
import { DocumentPanels } from "@/components/hub/DocumentPanels";
import { CallSheetPanels } from "@/components/callsheets/CallSheetPanels";

// One record: its details, the edit form (with Edit access) and any child list.
export default async function RecordPage({ params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  if (module === "crew") redirect(`/crew-roster/${encodeURIComponent(id)}`); // the crew module became the Crew workspace
  const def = moduleByKey(module);
  if (!def) notFound();
  const row = await getRecord(def, id);
  if (!row) return <NoAccess what={`this ${def.singular}`} />;
  const { me, grants, productions } = await hubContext();
  const production = row.production_id ? productions.find((p) => p.id === row.production_id) : undefined;
  const canEdit = me.isOwner || grants.some((g) => g.section_key === def.section && g.production_id === row.production_id && g.level === "edit");
  const blocked = writeBlockReason();
  const title = String(row[def.titleField] ?? def.singular);
  const childDef = def.child ? moduleByKey(def.child.module) : undefined;
  const children = childDef && def.child ? await listModule(childDef, undefined, { field: def.child.parentField, id: row.id }) : null;
  const back = production && !def.hidden ? `/productions/${production.slug}/${def.key}` : listHrefForModule(def.key);
  const backLabel = workspaceByKey(def.key)?.title ?? def.title;

  return (
    <>
      <PageHead
        title={title}
        lead={<><Link className="link" href={back}>{backLabel}</Link>{production ? <> · <Link className="link" href={`/productions/${production.slug}`}>{production.title}</Link></> : def.studioLevel !== "never" ? " · Studio-wide" : null}</>}
      />
      {row.source ? <p className="msg">Imported from the Final Hand portal (Airtable). The original record is kept in Airtable.</p> : null}

      {canEdit && !blocked ? (
        <section className="panel">
          <h2>Details</h2>
          <RecordForm module={def.key} fields={def.fields} values={row} id={row.id} scope={row.production_id ?? ""} submitLabel="Save changes" />
        </section>
      ) : (
        <section className="panel">
          <h2>Details</h2>
          {blocked && canEdit && <p className="small">{blocked}</p>}
          <dl className="facts">
            {def.fields.map((f) => {
              const v = row[f.name];
              if (v === null || v === undefined || v === "") return null;
              const shown = f.type === "select" ? optionLabel(f, v) : f.type === "date" ? formatDay(String(v)) : f.type === "time" ? String(v).slice(0, 5) : String(v);
              return (
                <div key={f.name} className="fact">
                  <dt>{f.label}</dt>
                  <dd>{f.type === "url" ? <a className="link" href={String(v)} target="_blank" rel="noreferrer noopener">{shown}</a> : <span className="pre">{shown}</span>}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      {def.key === "scripts" && <ScriptPanels row={row} canEdit={canEdit} blocked={blocked} />}
      {def.table === "documents" && <DocumentPanels row={row} canEdit={canEdit} blocked={blocked} />}
      {def.key === "call-sheets" && <CallSheetPanels row={row} canEdit={canEdit} blocked={blocked} />}

      {childDef && children && (
        <section className="panel">
          <h2>{childDef.title}</h2>
          <ModuleTable def={childDef} rows={children.rows} empty={<p className="small">Nobody added yet.</p>} />
          {canEdit && !blocked && (
            <details className="add-inline">
              <summary className="link">Add a {childDef.singular}</summary>
              <RecordForm module={childDef.key} fields={childDef.fields} parentId={row.id} submitLabel="Add" resetOnDone />
            </details>
          )}
          {canEdit && !blocked && children.rows.length > 0 && (
            <div className="child-delete">
              {children.rows.map((c) => (
                <ActionForm key={c.id} action={deleteModuleRecord} fields={{ module: childDef.key, id: c.id }} label={`Remove ${String(c.full_name)}`} busy="Removing…" quiet confirm={`Remove ${String(c.full_name)} from this call sheet?`} />
              ))}
            </div>
          )}
        </section>
      )}

      {canEdit && !blocked && !row.source && (
        <section className="panel danger">
          <h2>Delete</h2>
          <ActionForm action={deleteModuleRecord} fields={{ module: def.key, id: row.id }} label={`Delete this ${def.singular}`} busy="Deleting…" quiet confirm={`Delete “${title}”? This can't be undone.`} />
        </section>
      )}
    </>
  );
}
