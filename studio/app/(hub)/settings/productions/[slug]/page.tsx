import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { isOwnerHere } from "@/lib/hub/owner";
import { productionBySlug } from "@/lib/hub/data";
import { PRODUCTION_SECTIONS } from "@/lib/hub/access";
import { SECTION_LABEL, STAGES, STAGE_LABEL, STAGE_STATUSES, STAGE_STATUS_LABEL, type Stage } from "@/lib/hub/labels";
import { removeDepartment, setSectionEnabled, setStageStatus, updateProduction } from "@/lib/hub/production-actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ProductionForm } from "@/components/hub/ProductionForm";
import { DepartmentForm } from "./DepartmentForm";

export const metadata = { title: "Production settings · BLEUSKM Studio OS" };

export default async function ProductionSettings({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  const p = await productionBySlug((await params).slug);
  if (!p) notFound();
  const { supabase } = await loadSession();
  const [{ data: stages }, { data: sections }, { data: departments }] = await Promise.all([
    supabase.from("production_stages").select("id, stage, status").eq("production_id", p.id),
    supabase.from("production_sections").select("section_key, enabled").eq("production_id", p.id),
    supabase.from("production_departments").select("id, name, sort").eq("production_id", p.id).order("sort"),
  ]);
  const stageRows = STAGES.map((s) => (stages ?? []).find((r) => r.stage === s)).filter(Boolean) as { id: string; stage: Stage; status: string }[];
  const on = new Map((sections ?? []).map((s) => [s.section_key as string, s.enabled as boolean]));

  return (
    <>
      <PageHead title={p.title} lead={<><Link className="link" href="/settings/productions">Production settings</Link> · <Link className="link" href={`/productions/${p.slug}`}>Open production</Link></>} />
      <section className="panel">
        <h2>Details</h2>
        <p className="small">Set the status to Archived to move it off the main lists. Nothing is deleted, and you can bring it back by changing the status.</p>
        <ProductionForm action={updateProduction} values={p} submit="Save details" />
      </section>
      <section className="panel">
        <h2>Lifecycle stages</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {stageRows.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{STAGE_LABEL[s.stage]}</th>
                  <td>
                    <form action={setStageStatus} className="seg">
                      <input type="hidden" name="stage_id" value={s.id} />
                      {STAGE_STATUSES.map((st) => (
                        <button key={st} name="status" value={st} type="submit" className={`chip${s.status === st ? " on" : ""}`} aria-pressed={s.status === st}>{STAGE_STATUS_LABEL[st]}</button>
                      ))}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Sections in use</h2>
        <p className="small">A section that's switched off is closed to everyone but you, whatever their access says. Their access is kept for when you switch it back on.</p>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {PRODUCTION_SECTIONS.map((k) => {
                const enabled = on.get(k) ?? false;
                return (
                  <tr key={k}>
                    <th scope="row">{SECTION_LABEL[k]}</th>
                    <td>{enabled ? <span className="tag tag-active">On</span> : <span className="tag tag-archived">Off</span>}</td>
                    <td>
                      <form action={setSectionEnabled}>
                        <input type="hidden" name="production_id" value={p.id} />
                        <input type="hidden" name="section_key" value={k} />
                        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                        <button className="chip" type="submit">{enabled ? "Switch off" : "Switch on"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Departments</h2>
        <p className="small">Labels for organizing work inside this production. They never decide who can see what.</p>
        {(departments ?? []).length > 0 && (
          <ul className="plain">
            {(departments ?? []).map((d) => (
              <li key={d.id} className="dept">
                <span>{d.name}</span>
                <form action={removeDepartment}>
                  <input type="hidden" name="department_id" value={d.id} />
                  <button className="chip" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <DepartmentForm productionId={p.id} />
      </section>
    </>
  );
}
