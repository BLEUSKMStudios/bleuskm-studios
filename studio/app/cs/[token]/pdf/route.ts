import { NextResponse } from "next/server";
import { sendByToken } from "@/lib/callsheets/public";
import { buildCallSheetPdf } from "@/lib/callsheets/pdf";
import { pdfName } from "@/lib/callsheets/sheet";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await sendByToken(token);
  if (!found || !found.current || found.send.status === "replaced") return new NextResponse("This link isn't valid.", { status: 404 });
  const pdf = await buildCallSheetPdf(found.sheet, { highlightEntryId: found.send.entryId });
  return new NextResponse(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdfName(found.sheet)}"`, "cache-control": "private, no-store" },
  });
}
