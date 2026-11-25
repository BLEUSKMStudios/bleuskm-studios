import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isToken } from "./links.ts";

export type PublicPackage = {
  id: string; productionId: string; film: string; name: string; message: string | null; status: string; requireAck: boolean;
  acknowledgedAt: string | null; items: { id: string; title: string; category: string; opened: boolean }[];
};

/** The package behind a personal materials link (server key; only this package). */
export async function packageByToken(token: string): Promise<{ admin: SupabaseClient; pkg: PublicPackage } | null> {
  if (!isToken(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: p } = await admin.from("onboarding_packages").select("id, production_id, recipient_name, message, status, require_ack, acknowledged_at")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!p || p.status === "draft" || p.status === "cancelled") return null;
  const [{ data: items }, { data: prod }] = await Promise.all([
    admin.from("onboarding_items").select("id, title, category, first_opened_at").eq("package_id", p.id).order("sort"),
    admin.from("productions").select("title").eq("id", p.production_id).maybeSingle(),
  ]);
  return {
    admin,
    pkg: {
      id: p.id as string, productionId: p.production_id as string, film: (prod?.title as string) ?? "", name: p.recipient_name as string,
      message: (p.message as string | null) ?? null, status: p.status as string, requireAck: !!p.require_ack, acknowledgedAt: (p.acknowledged_at as string | null) ?? null,
      items: (items ?? []).map((i) => ({ id: i.id as string, title: i.title as string, category: i.category as string, opened: !!i.first_opened_at })),
    },
  };
}
