import { NextResponse } from "next/server";
import { agreementByToken, logEvent, newCode, requestMeta, OTP_MINUTES } from "@/lib/contracts/public";
import { maskEmail } from "@/lib/contracts/render";
import { sendTransactional } from "@/lib/hub/mailer";
import { firstName } from "@/lib/hub/templates";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";

// Step 1 of signing: email a one-time code to the address the agreement was
// sent to. Entering it proves the signer controls that address.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (writeBlockReason()) return NextResponse.json({ ok: false, error: "Signing is switched off on this preview." }, { status: 403 });
  const { token } = await params;
  const ctx = await agreementByToken(token);
  if (!ctx) return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 404 });
  const { admin, r, state } = ctx;
  if (state !== "sent" && state !== "viewed") return NextResponse.json({ ok: false, error: "This agreement is no longer open for signing." }, { status: 410 });
  const meta = requestMeta(request.headers);
  const c = await newCode(admin, r.id);
  if ("error" in c) return NextResponse.json({ ok: false, error: c.error }, { status: 429 });
  const sent = await sendTransactional(admin, {
    identityKey: r.identity_key, to: { email: r.signer_email, name: r.signer_name },
    subject: `Your BLEUSKM signing code: ${c.code}`,
    body: `Hi ${firstName(r.signer_name)},\n\nYour one-time code to sign your agreement with BLEUSKM Studios is:\n\n${c.code}\n\nIt works for ${OTP_MINUTES} minutes. If you didn't ask for it, you can ignore this email; nobody can sign without it.\n\nBLEUSKM Studios`,
    idempotencyKey: `contract-code:${c.id}`, contactId: r.contact_id, productionId: r.production_id, section: "documents",
    templateKey: "contract_code", related: { table: "contract_requests", id: r.id }, activityKind: "contract.code_sent",
    activitySummary: `Signing code emailed to ${r.signer_email}`,
  });
  if (sent.status !== "sent") {
    await admin.from("contract_otps").delete().eq("id", c.id);
    return NextResponse.json({ ok: false, error: "We couldn't email your code just now. Please try again in a few minutes, or reply to our email." }, { status: 502 });
  }
  await logEvent(admin, r.id, "code_sent", meta, { to: maskEmail(r.signer_email) });
  return NextResponse.json({ ok: true, to: maskEmail(r.signer_email) });
}
