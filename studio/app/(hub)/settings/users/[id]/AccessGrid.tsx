"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveGrid } from "@/lib/hub/user-actions";

type Row = { scope: string | null; title: string; note?: string; disabled: string[] };
type Col = { key: string; label: string };
type Level = "none" | "view" | "edit";

const cell = (scope: string | null, section: string) => `cell:${scope ?? "studio"}:${section}`;

export function AccessGrid({ userId, rows, cols, studioCols, studioOnly = [], initial }: {
  userId: string;
  rows: Row[];
  cols: Col[];
  studioCols: string[];
  studioOnly?: string[];
  initial: Record<string, Level>;
}) {
  const [values, setValues] = useState<Record<string, Level>>(initial);
  // When the saved access changes (after Save or Copy), show it.
  const savedKey = JSON.stringify(initial);
  useEffect(() => setValues(JSON.parse(savedKey)), [savedKey]);
  const [state, action, pending] = useActionState(saveGrid, undefined);
  const applies = (scope: string | null, section: string) => (scope !== null ? !studioOnly.includes(section) : studioCols.includes(section));
  const changed = useMemo(() => Object.keys({ ...initial, ...values }).filter((k) => (initial[k] ?? "none") !== (values[k] ?? "none")).length, [initial, values]);
  const setRow = (scope: string | null, level: Level) =>
    setValues((v) => {
      const next = { ...v };
      for (const c of cols) if (applies(scope, c.key)) next[cell(scope, c.key)] = level;
      return next;
    });

  return (
    <form action={action}>
      <input type="hidden" name="user_id" value={userId} />
      <div className="table-wrap">
        <table className="table grid">
          <thead>
            <tr>
              <th scope="col">Where</th>
              {cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
              <th scope="col">Whole row</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scope ?? "studio"}>
                <th scope="row">{r.title}{r.note && <span className="small block">{r.note}</span>}</th>
                {cols.map((c) => {
                  if (!applies(r.scope, c.key)) return <td key={c.key} className="na" title={r.scope === null ? "Not used at Studio level" : "Studio level only"}>—</td>;
                  const name = cell(r.scope, c.key);
                  const v = values[name] ?? "none";
                  const off = r.disabled.includes(c.key);
                  return (
                    <td key={c.key} className={`${v !== (initial[name] ?? "none") ? "dirty " : ""}${off ? "off" : ""}`}>
                      <select name={name} value={v} aria-label={`${c.label}, ${r.title}`} onChange={(e) => setValues((x) => ({ ...x, [name]: e.target.value as Level }))} className={`lvl lvl-${v}`}>
                        <option value="none">No access</option>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                      </select>
                      {off && <span className="small block" title="Switched off for this production">off</span>}
                    </td>
                  );
                })}
                <td className="row-tools">
                  <button type="button" className="chip" onClick={() => setRow(r.scope, "view")}>View</button>
                  <button type="button" className="chip" onClick={() => setRow(r.scope, "edit")}>Edit</button>
                  <button type="button" className="chip" onClick={() => setRow(r.scope, "none")}>None</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid-save">
        <button className="btn btn-inline" type="submit" disabled={pending || changed === 0}>{pending ? "Saving…" : changed ? `Save ${changed} change${changed === 1 ? "" : "s"}` : "No changes"}</button>
        {changed > 0 && !pending && <button type="button" className="btn btn-quiet btn-inline" onClick={() => setValues(initial)}>Undo changes</button>}
        {state?.error && <p className="msg error" role="alert">{state.error}</p>}
        {state?.done && changed === 0 && <p className="msg" role="status">{state.done}</p>}
      </div>
    </form>
  );
}
