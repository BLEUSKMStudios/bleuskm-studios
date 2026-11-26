"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { writeBlockReason } from "./env.ts";
import { DOC_BUCKET, MAX_DOC_BYTES, docStoragePath, docType, isDocPath } from "./doc-files.ts";

export type ActionState = { error?: string; done?: string } | undefined;
export type UploadTicket = { error?: string; path?: string; token?: string };

type Doc = { id: string; production_id: string | null; title: string; category: string; storage_path: string | null; source: string | null };

async function docForEdit(id: string) {
  if (!isUuid(id)) return { error: "Unknown document." } as const;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("documents").select("id, production_id, title, category, storage_path, source").eq("id", id).maybeSingle<Doc>();
  if (!data) return { error: "Unknown document." } as const;
  if (!(await dbCheck(data.production_id, "documents", "edit"))) return { error: "You don't have Edit access for this." } as const;
  if (data.source === "contract") return { error: "A signed agreement's file can't be replaced." } as const;
  return { supabase, doc: data } as const;
}

/** Step 1: checks the file and access, then a one-time upload address for the private bucket. */
export async function prepareDocUpload(docId: string, fileName: string, size: number): Promise<UploadTicket> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  if (!docType(fileName)) return { error: "That file type can't be stored. Use PDF, Word, Excel, PowerPoint, text or an image." };
  if (!Number.isFinite(size) || size <= 0) return { error: "That file is empty." };
  if (size > MAX_DOC_BYTES) return { error: "Files can be up to 50 MB." };
  const d = await docForEdit(docId);
  if ("error" in d) return { error: d.error };
  const admin = createAdminClient();
  if (!admin) return { error: "File storage isn't set up (server key missing)." };
  const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(docStoragePath(docId, fileName));
  if (error || !data) return { error: "The upload couldn't be started. Try again." };
  return { path: data.path, token: data.token };
}

/** Step 2: record the uploaded file on the document. */
export async function attachDocFile(docId: string, path: string, fileName: string, size: number): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const mime = docType(fileName);
  if (!mime || !isDocPath(docId, path)) return { error: "That file can't be attached." };
  const d = await docForEdit(docId);
  if ("error" in d) return { error: d.error };
  if (d.doc.storage_path) return { error: "This document already has a file. Add a new version instead, so the earlier one stays on record." };
  const admin = createAdminClient();
  const name = path.split("/").pop()!;
  const { data: listed } = await admin!.storage.from(DOC_BUCKET).list(`documents/${docId}`, { search: name, limit: 5 });
  if (!(listed ?? []).some((o) => o.name === name)) return { error: "The upload didn't finish. Try again." };
  const { error } = await d.supabase.from("documents").update({ storage_path: path, file_name: fileName.slice(0, 255), mime_type: mime, size_bytes: Math.round(size) }).eq("id", docId);
  if (error) return { error: "The file was uploaded but couldn't be recorded. Try again." };
  revalidatePath(`/documents/${docId}`);
  return { done: "File added." };
}

/** A new version: a new document record that replaces this one (the old one and its file stay on record). */
export async function newDocVersion(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = typeof form.get("id") === "string" ? String(form.get("id")) : "";
  const d = await docForEdit(id);
  if ("error" in d) return { error: d.error };
  const { data: next } = await d.supabase.from("documents").select("id").eq("supersedes_id", id).maybeSingle();
  if (next) return { error: "There's already a newer version of this document." };
  const { data, error } = await d.supabase.from("documents").insert({
    production_id: d.doc.production_id, title: d.doc.title, category: d.doc.category, status: "draft", supersedes_id: id,
  }).select("id").single();
  if (error || !data) return { error: "Couldn't create the new version." };
  revalidatePath("/documents");
  redirect(`/documents/${data.id}`);
}
