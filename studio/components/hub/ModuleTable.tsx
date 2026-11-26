import Link from "next/link";
import { optionLabel, STATUS_TONE, type ModuleDef } from "@/lib/hub/modules";
import type { Row } from "@/lib/hub/module-data";
import { formatDay } from "@/lib/hub/dates";

export function Status({ value, label }: { value: string; label: string }) {
  return <span className={`tag tone-${STATUS_TONE[value] ?? "muted"}`}>{label}</span>;
}

function cell(def: ModuleDef, name: string, row: Row) {
  const f = def.fields.find((x) => x.name === name)!;
  const v = row[name];
  if (v === null || v === undefined || v === "") return <span className="faint">—</span>;
  if (f.name === "status") return <Status value={String(v)} label={optionLabel(f, v)} />;
  if (f.type === "select") return optionLabel(f, v);
  if (f.type === "date") return <span className="nowrap">{formatDay(String(v))}</span>;
  if (f.type === "time") return String(v).slice(0, 5);
  if (f.type === "url") return <a className="link" href={String(v)} target="_blank" rel="noreferrer noopener">Open</a>;
  if (f.type === "email") return <a className="link" href={`mailto:${String(v)}`}>{String(v)}</a>;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** The list of a module's records. */
export function ModuleTable({
  def, rows, hrefFor, productionTitle, empty,
}: {
  def: ModuleDef;
  rows: Row[];
  hrefFor?: (row: Row) => string;
  productionTitle?: (id: string | null) => string;
  empty: React.ReactNode;
}) {
  const cols = def.fields.filter((f) => f.list);
  if (rows.length === 0) return <div className="empty-state">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {cols.map((c) => <th key={c.name} scope="col">{c.label}</th>)}
            {productionTitle && <th scope="col">Production</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {cols.map((c, i) => (
                i === 0 ? (
                  <th key={c.name} scope="row">
                    {hrefFor ? <Link href={hrefFor(r)}>{String(r[c.name] ?? "Untitled")}</Link> : String(r[c.name] ?? "")}
                    {r.source ? <span className="tag tone-muted tag-sm" title="Imported from the Final Hand portal">Imported</span> : null}
                  </th>
                ) : <td key={c.name}>{cell(def, c.name, r)}</td>
              ))}
              {productionTitle && <td>{productionTitle(r.production_id)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
