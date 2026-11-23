"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { checkScope, moduleByKey, parseFields } from "./modules.ts";
import { writeBlockReason } from "./env.ts";

export type ActionState = { error?: string; done?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function dbError(code: string | undefined): string {
  if (code === "42501") return "You don't have Edit access for this.";
  if (code === "23514") return "One of the values isn't allowed. Check the fields and try again.";
  if (code === "23505") return "That record already exists.";
  if (code === "23503") return "A linked record no longer exists.";
  return "Couldn't save. Try again.";
}

/** Adds or updates a record in any module. The database enforces access again. */
export async function saveModuleRecord(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const def = moduleByKey(text(form.get("module")));
  if (!def) return { error: "Unknown section." };
  const id = text(form.get("id"));
  if (id && !isUuid(id)) return { error: "Unknown record." };
  const { supabase } = await loadSession();

  // Where the record lives: its parent's production (call sheet lines), or the chosen production.
  let productionId: string | null = text(form.get("production_id")) || null;
  const extra: Record<string, string> = {};
  const parentModule = def.key === "call-sheet-lines" ? moduleByKey("call-sheets") : undefined;
  if (parentModule?.child) {
    const parentId = text(form.get("parent_id"));
    if (!isUuid(parentId)) return { error: "Unknown call sheet." };
    const { data: parent } = await supabase.from(parentModule.table).select("production_id").eq("id", parentId).maybeSingle();
    if (!parent) return { error: "That call sheet no longer exists." };
    productionId = parent.production_id as string;
    extra[parentModule.child.parentField] = parentId;
  }
  if (productionId !== null && !isUuid(productionId)) return { error: "Choose a production." };
  const scope = checkScope(def, productionId);
  if (scope) return { error: scope };
  if (!(await dbCheck(productionId, def.section, "edit"))) return { error: `You need Edit access to ${def.title}${productionId ? " on this production" : " at Studio level"}.` };

  const parsed = parseFields(def, (n) => form.get(n));
  if (!parsed.ok) return { error: parsed.error };
  const values = { ...parsed.values, ...extra, production_id: productionId };

  if (id) {
    const { data, error } = await supabase.from(def.table).update(values).eq("id", id).select("id");
    if (error) return { error: dbError(error.code) };
    if (!data?.length) return { error: "You can't edit this record." };
  } else {
    const { error } = await supabase.from(def.table).insert(values);
    if (error) return { error: dbError(error.code) };
  }
  revalidatePath("/", "layout");
  return { done: id ? "Saved." : `Added the ${def.singular}.` };
}

/** Deletes one record. Needs Edit on the record's production (RLS checks too). */
export async function deleteModuleRecord(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const def = moduleByKey(text(form.get("module")));
  const id = text(form.get("id"));
  if (!def || !isUuid(id)) return { error: "Unknown record." };
  const { supabase } = await loadSession();
  const { data: row } = await supabase.from(def.table).select("production_id, source").eq("id", id).maybeSingle();
  if (!row) return { error: "That record no longer exists." };
  if (row.source) return { error: "Imported records are kept for history and can't be deleted here. Change their status instead." };
  if (!(await dbCheck((row.production_id as string | null) ?? null, def.section, "edit"))) return { error: "You don't have Edit access for this." };
  const { data, error } = await supabase.from(def.table).delete().eq("id", id).select("id");
  if (error) return { error: dbError(error.code) };
  if (!data?.length) return { error: "You can't delete this record." };
  revalidatePath("/", "layout");
  return { done: "Deleted." };
}
