import { NextResponse } from "next/server";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { loadSheet } from "@/lib/callsheets/data";
import { buildCallSheetPdf } from "@/lib/callsheets/pdf";
import { pdfName } from "@/lib/callsheets/sheet";

export const dynamic = "force-dynamic";

// The current call sheet as a PDF, for anyone who can see it (RLS decides).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSignedIn();
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const { supabase } = await loadSession();
  const loaded = await loadSheet(supabase, id);
  if (!loaded) return new NextResponse("Not found", { status: 404 });
  const pdf = await buildCallSheetPdf(loaded.sheet);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${pdfName(loaded.sheet)}"`, "cache-control": "private, no-store" },
  });
}
