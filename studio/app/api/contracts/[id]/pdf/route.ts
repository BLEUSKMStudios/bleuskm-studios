import { NextResponse } from "next/server";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { SIGNATURE_BUCKET } from "@/lib/contracts/data";

export const dynamic = "force-dynamic";

// The signed PDF, for people with Documents access to its production. The
// database decides (RLS); then a 2-minute private link is issued and logged.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const me = await requireSignedIn();
  const { supabase } = await loadSession();
  const { data: r } = await supabase.from("contract_requests").select("id, pdf_path, signer_name, template_key").eq("id", id).maybeSingle();
  if (!r?.pdf_path) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("File storage isn't set up", { status: 503 });
  const view = new URL(request.url).searchParams.get("view") === "1";
  const name = `${r.template_key}-${String(r.signer_name).replace(/[^\w-]+/g, "-")}.pdf`;
  const { data } = await admin.storage.from(SIGNATURE_BUCKET).createSignedUrl(r.pdf_path as string, 120, view ? undefined : { download: name });
  if (!data?.signedUrl) return new NextResponse("The file couldn't be opened", { status: 502 });
  await admin.from("contract_events").insert({ request_id: id, kind: view ? "pdf_viewed" : "pdf_downloaded", actor: "staff", actor_id: me.id, actor_name: me.fullName });
  return NextResponse.redirect(data.signedUrl, 303);
}
