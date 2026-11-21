import Link from "next/link";
import { isOwnerHere } from "@/lib/hub/owner";
import { hubContext } from "@/lib/hub/data";
import { STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/hub/labels";
import { NoAccess, PageHead } from "@/components/hub/Page";

export const metadata = { title: "Production settings · BLEUSKM Studio OS" };

export default async function ProductionSettingsList() {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  const { productions } = await hubContext();
  return (
    <>
      <PageHead title="Productions" lead={<><Link className="link" href="/settings">Settings</Link> · Details, stages, sections and departments</>}>
        <Link className="btn btn-inline" href="/productions/new">New production</Link>
      </PageHead>
      <section className="panel">
        {productions.length === 0 ? <p className="small">No productions yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Production</th><th>Type</th><th>Status</th><th>Current stage</th><th></th></tr></thead>
              <tbody>
                {productions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td><td>{TYPE_LABEL[p.type]}</td><td>{STATUS_LABEL[p.status]}</td><td>{STAGE_LABEL[p.current_stage]}</td>
                    <td><Link className="link" href={`/settings/productions/${p.slug}`}>Edit settings</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
