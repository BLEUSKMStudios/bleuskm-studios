"use client";

import { createContext, useContext, useState } from "react";

type Sel = { picked: Set<string>; toggle: (id: string, on: boolean) => void; setAll: (ids: string[], on: boolean) => void };
const Ctx = createContext<Sel | null>(null);

/** Shares ticked rows between a table and the bulk-action forms below it. */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const setAll = (ids: string[], on: boolean) => setPicked((p) => { const n = new Set(p); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  return <Ctx.Provider value={{ picked, toggle, setAll }}>{children}</Ctx.Provider>;
}

export function PickBox({ id, label }: { id: string; label: string }) {
  const s = useContext(Ctx);
  return <input type="checkbox" aria-label={label} checked={!!s?.picked.has(id)} onChange={(e) => s?.toggle(id, e.target.checked)} />;
}

export function PickAll({ ids }: { ids: string[] }) {
  const s = useContext(Ctx);
  const all = ids.length > 0 && ids.every((id) => s?.picked.has(id));
  return <input type="checkbox" aria-label="Select all shown" checked={all} onChange={(e) => s?.setAll(ids, e.target.checked)} />;
}

/** Hidden "ids" fields for the ticked rows, plus a count. */
export function PickedInputs() {
  const s = useContext(Ctx);
  const ids = [...(s?.picked ?? [])];
  return (
    <>
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <p className="small wide" style={{ margin: "0 0 10px" }}>{ids.length === 0 ? "No applicants ticked yet." : `${ids.length} ticked.`}</p>
    </>
  );
}
