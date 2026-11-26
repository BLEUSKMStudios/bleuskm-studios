import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isToken } from "@/lib/hub/links";
import type { Sheet } from "./sheet.ts";
import { loadSheet } from "./data.ts";

export type PublicSend = { id: string; name: string; status: string; version: number; entryId: string | null; confirmedAt: string | null };

/** The call sheet behind a personal link (server key; only this sheet). A replaced link still opens, to say there's a newer version. */
export async function sendByToken(token: string): Promise<{ admin: SupabaseClient; send: PublicSend; sheet: Sheet; current: boolean } | null> {
  if (!isToken(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: s } = await admin.from("call_sheet_sends").select("id, call_sheet_id, recipient_name, status, version, entry_id, confirmed_at")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!s || s.status === "cancelled") return null;
  const loaded = await loadSheet(admin, s.call_sheet_id as string);
  if (!loaded) return null;
  return {
    admin,
    send: { id: s.id as string, name: s.recipient_name as string, status: s.status as string, version: s.version as number, entryId: (s.entry_id as string | null) ?? null, confirmedAt: (s.confirmed_at as string | null) ?? null },
    sheet: loaded.sheet,
    current: loaded.sheet.version === s.version,
  };
}
