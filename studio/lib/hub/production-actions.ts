"use server";

import { writeBlockReason } from "./env.ts";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner, loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { PRODUCTION_STATUSES, PRODUCTION_TYPES, STAGES, STAGE_STATUSES, oneOf, slugify } from "./labels.ts";
import { PRODUCTION_SECTIONS } from "./access.ts";

export type ActionState = { error?: string; done?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDetails(form: FormData): { error: string } | { title: string; type: string; status: string; current_stage: string; start_date: string | null; end_date: string | null } {
  const title = text(form.get("title"));
  const type = text(form.get("type"));
  const status = text(form.get("status")) || "planning";
  const stage = text(form.get("current_stage")) || "development";
  const start = text(form.get("start_date"));
  const end = text(form.get("end_date"));
  if (!title || title.length > 120) return { error: "Enter a title (up to 120 characters)." };
  if (!oneOf(PRODUCTION_TYPES, type)) return { error: "Choose a type." };
  if (!oneOf(PRODUCTION_STATUSES, status)) return { error: "Choose a status." };
  if (!oneOf(STAGES, stage)) return { error: "Choose a stage." };
  if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return { error: "Dates must be valid dates." };
  if (start && end && end < start) return { error: "The end date can't be before the start date." };
  return { title, type, status, current_stage: stage, start_date: start || null, end_date: end || null };
}

export async function createProduction(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const me = await requireOwner(); // checked on every post: a form can be sent from anywhere
  const details = readDetails(form);
  if ("error" in details) return details;
  const { supabase } = await loadSession();
  const base = slugify(details.title);
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { error } = await supabase.from("productions").insert({ ...details, slug, created_by: me.id });
    if (!error) {
      revalidatePath("/", "layout");
      redirect(`/productions/${slug}`);
    }
    if (error.code !== "23505") return { error: "The production couldn't be created. Try again." };
  }
  return { error: "Choose a different title." };
}

export async function updateProduction(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  await requireOwner();
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown production." };
  const details = readDetails(form);
  if ("error" in details) return details;
  const { supabase } = await loadSession();
  const { error } = await supabase.from("productions").update(details).eq("id", id);
  if (error) return { error: "The changes couldn't be saved. Try again." };
  revalidatePath("/", "layout");
  return { done: "Saved." };
}

export async function setStageStatus(form: FormData): Promise<void> {
  if (writeBlockReason()) return;
  await requireOwner();
  const id = text(form.get("stage_id"));
  const status = text(form.get("status"));
  if (!isUuid(id) || !oneOf(STAGE_STATUSES, status)) return;
  const { supabase } = await loadSession();
  await supabase.from("production_stages").update({ status }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setSectionEnabled(form: FormData): Promise<void> {
  if (writeBlockReason()) return;
  await requireOwner();
  const productionId = text(form.get("production_id"));
  const section = text(form.get("section_key"));
  const enabled = text(form.get("enabled")) === "true";
  if (!isUuid(productionId) || !(PRODUCTION_SECTIONS as readonly string[]).includes(section)) return;
  const { supabase } = await loadSession();
  await supabase.from("production_sections").upsert({ production_id: productionId, section_key: section, enabled });
  revalidatePath("/", "layout");
}

export async function addDepartment(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  await requireOwner();
  const productionId = text(form.get("production_id"));
  const name = text(form.get("name"));
  if (!isUuid(productionId)) return { error: "Unknown production." };
  if (!name || name.length > 60) return { error: "Enter a department name (up to 60 characters)." };
  const { supabase } = await loadSession();
  const { count } = await supabase.from("production_departments").select("id", { count: "exact", head: true }).eq("production_id", productionId);
  const { error } = await supabase.from("production_departments").insert({ production_id: productionId, name, sort: (count ?? 0) + 1 });
  if (error) return { error: error.code === "23505" ? "That department already exists." : "The department couldn't be added." };
  revalidatePath("/", "layout");
  return { done: `Added ${name}.` };
}

export async function removeDepartment(form: FormData): Promise<void> {
  if (writeBlockReason()) return;
  await requireOwner();
  const id = text(form.get("department_id"));
  if (!isUuid(id)) return;
  const { supabase } = await loadSession();
  await supabase.from("production_departments").delete().eq("id", id);
  revalidatePath("/", "layout");
}
