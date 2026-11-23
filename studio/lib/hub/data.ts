import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { loadSession, requireSignedIn, type Me } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import type { Grant } from "./access.ts";
import type { ProductionStatus, ProductionType, Stage } from "./labels.ts";

export type Production = {
  id: string;
  slug: string;
  title: string;
  type: ProductionType;
  status: ProductionStatus;
  current_stage: Stage;
  start_date: string | null;
  end_date: string | null;
};

export type HubContext = {
  me: Me;
  grants: Grant[];
  productions: Production[]; // every production this person may see (RLS decides)
};

const PRODUCTION_COLUMNS = "id, slug, title, type, status, current_stage, start_date, end_date";

/**
 * Everything the hub layout and pages need about the signed-in person, loaded
 * once per request. Row Level Security decides what comes back.
 */
export const hubContext = cache(async (): Promise<HubContext> => {
  const me = await requireSignedIn();
  const { supabase } = await loadSession();
  const [{ data: grants }, { data: productions }] = await Promise.all([
    supabase.from("access_grants").select("id, production_id, section_key, level").eq("user_id", me.id),
    supabase.from("productions").select(PRODUCTION_COLUMNS).order("title"),
  ]);
  return { me, grants: (grants ?? []) as Grant[], productions: (productions ?? []) as Production[] };
});

/** A production by its address, or null when it doesn't exist or isn't visible to this person. */
export async function productionBySlug(slug: string): Promise<Production | null> {
  const { productions } = await hubContext();
  return productions.find((p) => p.slug === slug) ?? null;
}

/** Sections switched on for a production. */
export async function enabledSections(productionId: string): Promise<Set<string>> {
  const { supabase } = await loadSession();
  const { data } = await supabase.from("production_sections").select("section_key, enabled").eq("production_id", productionId);
  return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.section_key as string));
}

/** Asks the database (not the menu) whether the signed-in person has this access. */
export async function dbCheck(scope: string | null, section: string, level: "view" | "edit"): Promise<boolean> {
  if (scope !== null && !isUuid(scope)) return false;
  const { supabase } = await loadSession();
  const { data, error } = await supabase.rpc("check_access", { p_production: scope, p_section: section, p_level: level });
  return !error && data === true;
}

export function assertUuid(id: string): string {
  if (!isUuid(id)) notFound();
  return id;
}

export { PRODUCTION_COLUMNS };
