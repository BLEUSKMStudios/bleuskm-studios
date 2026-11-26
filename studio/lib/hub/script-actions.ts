"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { writeBlockReason } from "./env.ts";
import { MAX_SCRIPT_BYTES, SCRIPT_BUCKET, isScriptPath, scriptFormat, scriptStoragePath } from "./script-files.ts";

export type ActionState = { error?: string; done?: string } | undefined;
export type UploadTicket = { error?: string; path?: string; token?: string };

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The script (if this person can see it) and whether they may edit it. */
async function scriptForEdit(id: string) {
  if (!isUuid(id)) return { error: "Unknown script." } as const;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("scripts").select("id, production_id, storage_path").eq("id", id).maybeSingle();
  if (!data) return { error: "Unknown script." } as const;
  if (!(await dbCheck(data.production_id as string, "script_breakdown", "edit"))) return { error: "You don't have Edit access for this." } as const;
  return { supabase, script: data as { id: string; production_id: string; storage_path: string | null } } as const;
}

/**
 * Step 1 of an upload: checks the file and access, then gets a one-time
 * upload address for the private bucket. The browser sends the file there
 * directly (large PDFs never pass through the hub's server).
 */
export async function prepareScriptUpload(scriptId: string, fileName: string, size: number): Promise<UploadTicket> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const format = scriptFormat(fileName);
  if (!format) return { error: "Only PDF (.pdf) and Fountain (.fountain) files can be added." };
  if (!Number.isFinite(size) || size <= 0) return { error: "That file is empty." };
  if (size > MAX_SCRIPT_BYTES) return { error: "Files can be up to 50 MB." };
  const s = await scriptForEdit(scriptId);
  if ("error" in s) return { error: s.error };
  const path = scriptStoragePath(scriptId, fileName);
  const { data, error } = await s.supabase.storage.from(SCRIPT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "The upload couldn't be started. Try again." };
  return { path: data.path, token: data.token };
}

/** Step 2: after the browser uploaded, record the file on the script. */
export async function attachScriptFile(scriptId: string, path: string, fileName: string, size: number): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const format = scriptFormat(fileName);
  if (!format || !isScriptPath(scriptId, path)) return { error: "That file can't be attached." };
  const s = await scriptForEdit(scriptId);
  if ("error" in s) return { error: s.error };
  const name = path.split("/").pop()!;
  const { data: listed } = await s.supabase.storage.from(SCRIPT_BUCKET).list(`scripts/${scriptId}`, { search: name, limit: 5 });
  if (!(listed ?? []).some((o) => o.name === name)) return { error: "The upload didn't finish. Try again." };
  const { error } = await s.supabase.from("scripts").update({
    storage_path: path, file_name: fileName.slice(0, 255), mime_type: format.mime, size_bytes: Math.round(size),
  }).eq("id", scriptId);
  if (error) return { error: "The file was uploaded but couldn't be recorded. Try again." };
  revalidatePath(`/scripts/${scriptId}`);
  return { done: "File added." };
}

/** Adds this script to a further project. */
export async function linkScriptProject(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const scriptId = text(form.get("script_id"));
  const productionId = text(form.get("production_id"));
  if (!isUuid(productionId)) return { error: "Choose a project." };
  const s = await scriptForEdit(scriptId);
  if ("error" in s) return { error: s.error };
  if (!(await dbCheck(productionId, "script_breakdown", "edit"))) return { error: "You need Edit access to Scripts on that project too." };
  const { error } = await s.supabase.from("script_productions").insert({ script_id: scriptId, production_id: productionId });
  if (error) return { error: error.code === "23505" ? "It's already part of that project." : error.code === "23514" ? "That's the script's own project." : "Couldn't add the project. Try again." };
  revalidatePath(`/scripts/${scriptId}`);
  return { done: "Project added." };
}

export async function unlinkScriptProject(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const scriptId = text(form.get("script_id"));
  const productionId = text(form.get("production_id"));
  if (!isUuid(productionId)) return { error: "Unknown project." };
  const s = await scriptForEdit(scriptId);
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.from("script_productions").delete().eq("script_id", scriptId).eq("production_id", productionId);
  if (error) return { error: "Couldn't remove the project. Try again." };
  revalidatePath(`/scripts/${scriptId}`);
  return { done: "Project removed." };
}

/** Marks which earlier draft this one replaces (version history). */
export async function setScriptReplaces(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const scriptId = text(form.get("script_id"));
  const previous = text(form.get("supersedes_id"));
  if (previous && (!isUuid(previous) || previous === scriptId)) return { error: "Choose an earlier draft." };
  const s = await scriptForEdit(scriptId);
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.from("scripts").update({ supersedes_id: previous || null }).eq("id", scriptId);
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath(`/scripts/${scriptId}`);
  return { done: previous ? "Saved: this draft replaces the one chosen." : "Saved." };
}
