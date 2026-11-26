import { NextResponse } from "next/server";
import { packageByToken } from "@/lib/hub/onboarding-public";
import { requestMeta } from "@/lib/contracts/public";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";

// The person confirms they received their materials.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = new URL(`/d/${token}`, request.url);
  if (writeBlockReason()) return NextResponse.redirect(back, 303);
  const found = await packageByToken(token);
  if (!found) return new NextResponse("This link isn't valid.", { status: 404 });
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 200);
  if (!name || form.get("ok") !== "on") return NextResponse.redirect(back, 303);
  const { ip } = requestMeta(request.headers);
  await found.admin.from("onboarding_packages").update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), ack_name: name, ack_ip: ip })
    .eq("id", found.pkg.id).in("status", ["sent", "opened"]);
  back.searchParams.set("done", "1");
  return NextResponse.redirect(back, 303);
}
