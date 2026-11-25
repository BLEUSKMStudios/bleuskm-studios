import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sheetFromRows, type Sheet } from "./sheet.ts";

export const SHEET_COLS = "id, production_id, title, shoot_date, general_call, crew_call, location_text, parking, nearest_hospital, weather, sunrise, sunset, key_contacts, safety_notes, schedule, notes, status, version, last_sent_at, updated_at";
export const ENTRY_COLS = "id, full_name, position, team, call_time, notes, email, team_id, sort, updated_at";

/** A call sheet and its lines, read with whichever client is given (RLS for staff, server key for a personal link). */
export async function loadSheet(db: SupabaseClient, id: string): Promise<{ sheet: Sheet; raw: { sheet: Record<string, unknown>; entries: Record<string, unknown>[] } } | null> {
  const { data: s } = await db.from("call_sheets").select(SHEET_COLS).eq("id", id).maybeSingle();
  if (!s) return null;
  const [{ data: entries }, { data: p }] = await Promise.all([
    db.from("call_sheet_entries").select(ENTRY_COLS).eq("call_sheet_id", id).order("sort").order("call_time", { nullsFirst: false }),
    db.from("productions").select("title").eq("id", s.production_id).maybeSingle(),
  ]);
  const raw = { sheet: s as Record<string, unknown>, entries: (entries ?? []) as Record<string, unknown>[] };
  return { sheet: sheetFromRows({ sheet: raw.sheet, production: (p?.title as string) ?? "", entries: raw.entries }), raw };
}
