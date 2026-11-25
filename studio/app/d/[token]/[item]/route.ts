import { NextResponse } from "next/server";
import { packageByToken } from "@/lib/hub/onboarding-public";
import { isUuid } from "@/lib/sections";
import { DOC_BUCKET } from "@/lib/hub/doc-files";

export const dynamic = "force-dynamic";

// Opens one file from a materials page: records the open, then a 10-minute private link.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; item: string }> }) {
  const { token, item } = await params;
  const found = await packageByToken(token);
  if (!found || !isUuid(item)) return new NextResponse("This link isn't valid.", { status: 404 });
  const { admin, pkg } = found;
  const { data: it } = await admin.from("onboarding_items").select("id, document_id, first_opened_at, open_count").eq("id", item).eq("package_id", pkg.id).maybeSingle();
  if (!it?.document_id) return new NextResponse("This document is no longer available.", { status: 404 });
  const { data: doc } = await admin.from("documents").select("storage_path, drive_url, production_id, file_name").eq("id", it.document_id).maybeSingle();
  if (!doc || doc.production_id !== pkg.productionId) return new NextResponse("This document is no longer available.", { status: 404 });
  let url: string | null = null;
  if (doc.storage_path) {
    const { data } = await admin.storage.from(DOC_BUCKET).createSignedUrl(doc.storage_path as string, 600);
    url = data?.signedUrl ?? null;
  } else url = (doc.drive_url as string | null) ?? null;
  if (!url) return new NextResponse("This document is no longer available.", { status: 404 });
  await admin.from("onboarding_items").update({ first_opened_at: it.first_opened_at ?? new Date().toISOString(), open_count: (it.open_count as number) + 1 }).eq("id", it.id);
  if (pkg.status === "sent") {
    await admin.from("onboarding_packages").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", pkg.id).eq("status", "sent");
  }
  return NextResponse.redirect(url, 303);
}
