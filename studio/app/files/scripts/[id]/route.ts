import { NextResponse } from "next/server";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { SCRIPT_BUCKET } from "@/lib/hub/script-files";

export const dynamic = "force-dynamic";

/**
 * Download a script's stored file. Files are private: only a signed-in person
 * who can see the script record (Row Level Security) gets a one-minute link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSignedIn();
  const { id } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isUuid(id)) return notFound();
  const { supabase } = await loadSession();
  const { data: s } = await supabase.from("scripts").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!s?.storage_path) return notFound();
  const { data } = await supabase.storage.from(SCRIPT_BUCKET).createSignedUrl(s.storage_path as string, 60, { download: (s.file_name as string) || true });
  if (!data?.signedUrl) return notFound();
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
