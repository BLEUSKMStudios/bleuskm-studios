import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { formatBytes, scriptFormat } from "@/lib/hub/script-files";
import { linkScriptProject, setScriptReplaces, unlinkScriptProject } from "@/lib/hub/script-actions";
import { formatDay } from "@/lib/hub/dates";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { ActionForm } from "@/components/hub/ActionForm";
import { ScriptUpload } from "@/components/hub/ScriptUpload";
import type { Row } from "@/lib/hub/module-data";

type Draft = { id: string; title: string; version: string | null; draft_date: string | null; supersedes_id: string | null; production_id: string };

/** File, projects and version history for one script record. */
export async function ScriptPanels({ row, canEdit, blocked }: { row: Row; canEdit: boolean; blocked: string | null }) {
  const { productions } = await hubContext();
  const { supabase } = await loadSession();
  const [{ data: file }, { data: links }, { data: drafts }] = await Promise.all([
    supabase.from("scripts").select("storage_path, file_name, mime_type, size_bytes, supersedes_id").eq("id", row.id).maybeSingle(),
    supabase.from("script_productions").select("production_id").eq("script_id", row.id),
    supabase.from("scripts").select("id, title, version, draft_date, supersedes_id, production_id").eq("production_id", row.production_id!).order("draft_date", { ascending: false, nullsFirst: false }).limit(200),
  ]);
  const editable = canEdit && !blocked;
  const titleOf = (id: string) => productions.find((p) => p.id === id)?.title ?? "A project you can't open";
  const linked = (links ?? []).map((l) => l.production_id as string);
  const addable = productions.filter((p) => p.id !== row.production_id && !linked.includes(p.id) && p.status !== "archived");
  const all = (drafts ?? []) as Draft[];
  const supersedes = (file?.supersedes_id as string | null) ?? null;
  // Walk the chain: what this replaces, and what replaced it.
  const byId = new Map(all.map((d) => [d.id, d]));
  const earlier: Draft[] = [];
  for (let cur = supersedes ? byId.get(supersedes) : undefined; cur && earlier.length < 50; cur = cur.supersedes_id ? byId.get(cur.supersedes_id) : undefined) earlier.push(cur);
  const later: Draft[] = [];
  for (let cur = all.find((d) => d.supersedes_id === row.id); cur && later.length < 50; cur = all.find((d) => d.supersedes_id === cur!.id)) later.unshift(cur);
  const label = (d: Draft) => `${d.title}${d.version ? ` · ${d.version}` : ""}${d.draft_date ? ` · ${formatDay(d.draft_date)}` : ""}`;
  const fmt = file?.file_name ? scriptFormat(file.file_name as string) : null;

  return (
    <>
      <section className="panel">
        <h2>File</h2>
        {file?.storage_path ? (
          <p>
            <a className="btn btn-inline" href={`/files/scripts/${row.id}`}>Download</a>{" "}
            <span className="small">{String(file.file_name ?? "File")}{fmt ? ` · ${fmt.label}` : ""}{file.size_bytes ? ` · ${formatBytes(file.size_bytes as number)}` : ""}</span>
          </p>
        ) : <p className="small">No file stored in Studio OS{row.drive_url ? "; the external link above opens it" : ""}.</p>}
        {editable && <ScriptUpload scriptId={row.id} hasFile={!!file?.storage_path} />}
        {canEdit && blocked && <p className="small">{blocked}</p>}
      </section>

      <section className="panel">
        <h2>Projects</h2>
        <ul className="plain-list">
          <li><strong>{titleOf(row.production_id!)}</strong> <span className="small">· main project</span></li>
          {linked.map((pid) => (
            <li key={pid} className="row-between">
              <span>{titleOf(pid)}</span>
              {editable && <ActionForm action={unlinkScriptProject} fields={{ script_id: row.id, production_id: pid }} label="Remove" busy="Removing…" quiet />}
            </li>
          ))}
        </ul>
        {editable && addable.length > 0 && (
          <HubForm action={linkScriptProject} className="inline-form">
            <input type="hidden" name="script_id" value={row.id} />
            <label className="field"><span>Also part of</span>
              <select name="production_id" defaultValue="">
                <option value="" disabled>Choose a project…</option>
                {addable.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <Submit>Add project</Submit>
          </HubForm>
        )}
      </section>

      <section className="panel">
        <h2>Version history</h2>
        {earlier.length === 0 && later.length === 0 ? <p className="small">No earlier or later drafts are linked yet.</p> : (
          <ol className="plain-list">
            {later.map((d) => <li key={d.id}><Link className="link" href={`/scripts/${d.id}`}>{label(d)}</Link> <span className="small">· newer</span></li>)}
            <li><strong>This draft</strong></li>
            {earlier.map((d) => <li key={d.id}><Link className="link" href={`/scripts/${d.id}`}>{label(d)}</Link> <span className="small">· earlier</span></li>)}
          </ol>
        )}
        {editable && (
          <HubForm action={setScriptReplaces} className="inline-form">
            <input type="hidden" name="script_id" value={row.id} />
            <label className="field"><span>This draft replaces</span>
              <select name="supersedes_id" defaultValue={supersedes ?? ""}>
                <option value="">Nothing (first draft)</option>
                {all.filter((d) => d.id !== row.id).map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}
              </select>
            </label>
            <Submit>Save</Submit>
          </HubForm>
        )}
      </section>
    </>
  );
}
