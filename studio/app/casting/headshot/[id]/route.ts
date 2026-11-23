import { NextResponse } from "next/server";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { dbCheck } from "@/lib/hub/data";
import { BUCKET } from "@/lib/hub/casting-data";
import { cleanUrl } from "@/lib/hub/casting-core";
import { isUuid } from "@/lib/sections";

export const dynamic = "force-dynamic";

/**
 * Stable headshot link for an applicant, used in the Airtable Casting Submissions
 * "Headshot" field. Files stay private: only a signed-in Studio OS user who can view
 * Casting on that production is sent on to a short-lived signed link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSignedIn();
  const { id } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isUuid(id)) return notFound();

  const { supabase } = await loadSession();
  const { data: app } = await supabase.from("casting_applications").select("id, production_id").eq("id", id).maybeSingle();
  if (!app) return notFound();
  if (!(await dbCheck(app.production_id as string, "casting", "view"))) return notFound();

  const { data: mats } = await supabase.from("casting_materials").select("storage_path, url, created_at")
    .eq("application_id", id).eq("kind", "headshot").order("created_at", { ascending: true });
  const file = (mats ?? []).find((m) => m.storage_path);
  let to: string | null = null;
  if (file) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path as string, 300);
    to = data?.signedUrl ?? null;
  } else {
    const link = (mats ?? []).find((m) => m.url);
    to = link ? cleanUrl(link.url as string) : null;
  }
  if (!to) return notFound();
  return NextResponse.redirect(to, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
