import Link from "next/link";
import type { Production } from "@/lib/hub/data";
import { STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/hub/labels";

export function ProductionTable({ productions }: { productions: Production[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Production</th><th>Type</th><th>Status</th><th>Current stage</th></tr>
        </thead>
        <tbody>
          {productions.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/productions/${p.slug}`}>{p.title}</Link></td>
              <td>{TYPE_LABEL[p.type]}</td>
              <td><span className={`tag tag-${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
              <td>{STAGE_LABEL[p.current_stage]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
