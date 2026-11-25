import { NextResponse } from "next/server";
import { sendByToken } from "@/lib/callsheets/public";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";

// The person confirms they've got their call time (current version only).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = new URL(`/cs/${token}`, request.url);
  if (writeBlockReason()) return NextResponse.redirect(back, 303);
  const found = await sendByToken(token);
  if (!found) return new NextResponse("This link isn't valid.", { status: 404 });
  if (found.current && (found.send.status === "sent" || found.send.status === "opened")) {
    const now = new Date().toISOString();
    await found.admin.from("call_sheet_sends").update({ status: "confirmed", confirmed_at: now, opened_at: now })
      .eq("id", found.send.id).in("status", ["sent", "opened"]).is("opened_at", null);
    await found.admin.from("call_sheet_sends").update({ status: "confirmed", confirmed_at: now })
      .eq("id", found.send.id).in("status", ["sent", "opened"]);
    back.searchParams.set("done", "1");
  }
  return NextResponse.redirect(back, 303);
}
