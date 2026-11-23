import "server-only";

import { loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { selectColumns, loadError, type LoadError, type ModuleDef } from "./modules.ts";
export type { LoadError } from "./modules.ts";

export type Row = Record<string, unknown> & { id: string; production_id: string | null };

const LIMIT = 500;


/**
 * Records of one module. Row Level Security decides what comes back, so a
 * person only ever sees rows in productions (and Studio level) they hold a grant for.
 * production: a production id, "studio" for Studio-level rows, or undefined for all.
 */
export async function listModule(def: ModuleDef, production?: string, parent?: { field: string; id: string }): Promise<{ rows: Row[]; error: LoadError }> {
  const { supabase } = await loadSession();
  let q = supabase.from(def.table).select(selectColumns(def));
  for (const [k, v] of Object.entries(def.fixed ?? {})) q = q.eq(k, v);
  if (production === "studio") q = q.is("production_id", null);
  else if (production) {
    if (!isUuid(production)) return { rows: [], error: null };
    if (def.table === "scripts") {
      // A script also shows in every further project it is linked to.
      const { data: links } = await supabase.from("script_productions").select("script_id").eq("production_id", production).limit(LIMIT);
      const ids = (links ?? []).map((l) => l.script_id as string).filter(isUuid);
      q = ids.length ? q.or(`production_id.eq.${production},id.in.(${ids.join(",")})`) : q.eq("production_id", production);
    } else {
      q = q.eq("production_id", production);
    }
  }
  if (parent) {
    if (!isUuid(parent.id)) return { rows: [], error: null };
    q = q.eq(parent.field, parent.id);
  }
  const { data, error } = await q
    .order(def.orderBy.column, { ascending: def.orderBy.ascending, nullsFirst: def.orderBy.nullsFirst ?? false })
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  if (error) console.error(`[modules] could not list ${def.table}: ${error.code}`);
  return { rows: (data ?? []) as unknown as Row[], error: loadError(error) };
}

/** One record, or null when it doesn't exist or isn't visible to this person. */
export async function getRecord(def: ModuleDef, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  const { supabase } = await loadSession();
  let q = supabase.from(def.table).select(selectColumns(def)).eq("id", id);
  for (const [k, v] of Object.entries(def.fixed ?? {})) q = q.eq(k, v);
  const { data } = await q.maybeSingle();
  return (data ?? null) as unknown as Row | null;
}

/** How many records a module has in one production (for the workspace cards). */
export async function countModule(def: ModuleDef, productionId: string): Promise<number | null> {
  const { supabase } = await loadSession();
  let q = supabase.from(def.table).select("id", { count: "exact", head: true }).eq("production_id", productionId);
  for (const [k, v] of Object.entries(def.fixed ?? {})) q = q.eq(k, v);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}
