import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isToken } from "./links.ts";
import { inviteState, type InviteState } from "./selftape.ts";

export type PublicInvite = {
  id: string;
  applicationId: string;
  productionId: string;
  contactId: string | null;
  state: InviteState;
  firstName: string;
  fullName: string;
  email: string;
  film: string;
  role: string;
  crew: boolean;
  instructions: string | null;
  deadline: string | null;
  sidesUrl: string | null;
  sidesDocumentId: string | null;
  treatmentDocumentId: string | null;
  allowLinks: boolean;
  status: string;
  files: number;
};

/**
 * The invitation behind a personal upload link, read with the server key.
 * Returns only what the applicant needs to see; never any other applicant.
 */
export async function inviteByToken(token: string): Promise<{ admin: SupabaseClient; invite: PublicInvite } | null> {
  if (!isToken(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: inv } = await admin.from("selftape_invitations")
    .select("id, application_id, production_id, contact_id, status, deadline, instructions, sides_url, sides_document_id, treatment_document_id, allow_links")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!inv || inv.status === "draft") return null;
  const [{ data: app }, { data: prod }, { count }] = await Promise.all([
    admin.from("casting_applications").select("full_name, email, role_id, call_id").eq("id", inv.application_id).single(),
    admin.from("productions").select("title").eq("id", inv.production_id).single(),
    admin.from("casting_materials").select("id", { count: "exact", head: true }).eq("invitation_id", inv.id),
  ]);
  if (!app) return null;
  const [{ data: role }, { data: call }] = await Promise.all([
    admin.from("casting_roles").select("name").eq("id", app.role_id).maybeSingle(),
    admin.from("casting_calls").select("public_slug").eq("id", app.call_id).maybeSingle(),
  ]);
  const full = String(app.full_name ?? "");
  return {
    admin,
    invite: {
      id: inv.id as string,
      applicationId: inv.application_id as string,
      productionId: inv.production_id as string,
      contactId: (inv.contact_id as string | null) ?? null,
      state: inviteState({ status: inv.status as string, deadline: inv.deadline as string | null }),
      firstName: full.split(/\s+/)[0] || "there",
      fullName: full,
      email: app.email as string,
      film: (prod?.title as string) ?? "",
      role: (role?.name as string) ?? "",
      crew: /-crew$/.test((call?.public_slug as string) ?? ""),
      instructions: (inv.instructions as string | null) ?? null,
      deadline: (inv.deadline as string | null) ?? null,
      sidesUrl: (inv.sides_url as string | null) ?? null,
      sidesDocumentId: (inv.sides_document_id as string | null) ?? null,
      treatmentDocumentId: (inv.treatment_document_id as string | null) ?? null,
      allowLinks: !!inv.allow_links,
      status: inv.status as string,
      files: count ?? 0,
    },
  };
}

/** A short-lived link to a document the invitation shares (sides, treatment). */
export async function sharedDocLink(admin: SupabaseClient, documentId: string | null, productionId: string): Promise<{ title: string; url: string } | null> {
  if (!documentId) return null;
  const { data: d } = await admin.from("documents").select("title, drive_url, storage_path, production_id").eq("id", documentId).maybeSingle();
  if (!d || d.production_id !== productionId) return null;
  if (d.storage_path) {
    const { data } = await admin.storage.from("production-files").createSignedUrl(d.storage_path as string, 3600);
    return data?.signedUrl ? { title: d.title as string, url: data.signedUrl } : null;
  }
  return d.drive_url ? { title: d.title as string, url: d.drive_url as string } : null;
}
