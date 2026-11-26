import { NextResponse } from "next/server";
import { agreementByToken, checkCode, logEvent, requestMeta } from "@/lib/contracts/public";
import { AGREE_TEXT, CONSENT_TEXT, sameName, sha256 } from "@/lib/contracts/render";
import { buildSignedPdf, decodeSignaturePng, type PdfEvent } from "@/lib/contracts/pdf";
import { SIGNATURE_BUCKET, STUDIO_SIGNATURE_PATH } from "@/lib/contracts/data";
import { sendTransactional } from "@/lib/hub/mailer";
import { firstName } from "@/lib/hub/templates";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

// Step 2: verify the code, record consent and the signature, produce the
// signed PDF, file it, and email the signer their copy.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (writeBlockReason()) return fail("Signing is switched off on this preview.", 403);
  const { token } = await params;
  const ctx = await agreementByToken(token);
  if (!ctx) return fail("This link isn't valid.", 404);
  const { admin, r, agreement, state } = ctx;
  if (state !== "sent" && state !== "viewed") return fail("This agreement is no longer open for signing.", 410);
  if (!agreement) {
    console.error("[contracts] stored wording failed its integrity check");
    return fail("This agreement can't be signed right now. Please reply to our email so we can send a fresh copy.", 409);
  }
  const meta = requestMeta(request.headers);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? "").replace(/\D/g, "");
  const name = String(body.name ?? "").trim().slice(0, 200);
  const kind = body.kind === "drawn" ? "drawn" : "typed";
  if (body.consent !== true) return fail("Please agree to sign electronically.");
  if (body.agree !== true) return fail("Please confirm you have read and agree to the agreement.");
  if (String(body.content_hash ?? "") !== r.content_hash) return fail("This agreement was updated since you opened it. Please reload the page.", 409);
  if (!sameName(name, r.signer_name)) return fail(`Type your full name exactly as it appears on the agreement: ${r.signer_name}. If that isn't your legal name, reply to our email and we'll correct it before you sign.`);
  let drawn: Uint8Array | null = null;
  if (kind === "drawn") {
    drawn = decodeSignaturePng(String(body.drawing ?? ""));
    if (!drawn) return fail("Please draw your signature, or switch to typing it.");
  }

  const check = await checkCode(admin, r.id, code);
  if (!check.ok) {
    await logEvent(admin, r.id, "code_failed", meta);
    return fail(check.error);
  }
  // The code is spent whatever happens next.
  const { data: spent } = await admin.from("contract_otps").update({ used_at: new Date().toISOString() }).eq("id", check.otpId).is("used_at", null).select("id");
  if (!spent?.length) return fail("That code was already used. Ask for a new one.");
  const verifiedAt = new Date().toISOString();
  await logEvent(admin, r.id, "email_verified", meta, { method: "one-time code" }, name);
  const consentAt = new Date().toISOString();
  await logEvent(admin, r.id, "consented", meta, { consent: CONSENT_TEXT, agreed: AGREE_TEXT, content_sha256: r.content_hash }, name);

  // Files: the drawn signature and the studio's signature (if chosen), privately.
  const folder = `contracts/${r.production_id}/${r.id}`;
  let signaturePath: string | null = null;
  if (drawn) {
    signaturePath = `${folder}/signer-signature.png`;
    const up = await admin.storage.from(SIGNATURE_BUCKET).upload(signaturePath, drawn, { contentType: "image/png", upsert: false });
    if (up.error) return fail("We couldn't save your signature. Please try again.", 500);
  }
  let studioPng: Uint8Array | null = null;
  if (r.studio_signer?.kind === "image") {
    const { data } = await admin.storage.from(SIGNATURE_BUCKET).download(STUDIO_SIGNATURE_PATH);
    if (data) studioPng = new Uint8Array(await data.arrayBuffer());
  }
  const [{ data: evs }, { data: approver }, { data: identity }] = await Promise.all([
    admin.from("contract_events").select("at, kind, actor, actor_name, ip, hash").eq("request_id", r.id).order("id"),
    r.approved_by ? admin.from("profiles").select("full_name").eq("id", r.approved_by).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("email_identities").select("address").eq("key", r.identity_key).maybeSingle(),
  ]);
  const signedAt = new Date().toISOString();
  const events: PdfEvent[] = (evs ?? []).map((e) => ({ at: e.at as string, kind: e.kind as string, actor: e.actor as string, who: e.actor_name as string | null, ip: e.ip as string | null }));
  events.push({ at: signedAt, kind: "signed", actor: "signer", who: name, ip: meta.ip });
  const studio = r.studio_signer ?? { name: agreement.studio.name, title: agreement.studio.title, kind: "typed" as const };
  let pdf: Uint8Array;
  try {
    pdf = await buildSignedPdf({
      agreement, contentHash: r.content_hash!,
      studio: { name: studio.name, title: studio.title, kind: studioPng ? "image" : "typed", png: studioPng, at: r.approved_at ?? signedAt },
      signer: { name: r.signer_name, email: r.signer_email, kind, png: drawn, at: signedAt },
      certificate: {
        verifiedAt, consentAt, consentText: `${CONSENT_TEXT} ${AGREE_TEXT}`, ip: meta.ip, userAgent: meta.agent,
        approvedBy: (approver?.full_name as string | undefined) ?? null, approvedAt: r.approved_at, sentFrom: (identity?.address as string | undefined) ?? r.identity_key,
        events, chainHead: (evs?.[evs.length - 1]?.hash as string | undefined) ?? null,
      },
    });
  } catch (e) {
    console.error("[contracts] PDF generation failed", e instanceof Error ? e.message : "");
    return fail("We couldn't produce your signed copy. Nothing was signed; please try again.", 500);
  }
  const pdfHash = sha256(pdf);
  const pdfPath = `${folder}/signed-${pdfHash.slice(0, 12)}.pdf`;
  const up = await admin.storage.from(SIGNATURE_BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) return fail("We couldn't save your signed agreement. Nothing was signed; please try again.", 500);

  const { data: done, error } = await admin.from("contract_requests").update({
    status: "signed", signed_at: signedAt, signed_name: name, signature_kind: kind, signature_path: signaturePath,
    consent_at: consentAt, verified_at: verifiedAt, signer_ip: meta.ip, signer_agent: meta.agent, pdf_path: pdfPath, pdf_sha256: pdfHash,
  }).eq("id", r.id).in("status", ["sent", "viewed"]).select("id");
  if (error || !done?.length) return fail("This agreement couldn't be signed (it may have just been signed or withdrawn). Please reload.", 409);

  // The signer's copy.
  const filename = `${agreement.title} - ${r.signer_name}.pdf`.replace(/[^\w .()-]/g, "");
  await sendTransactional(admin, {
    identityKey: r.identity_key, to: { email: r.signer_email, name: r.signer_name },
    subject: `Signed: your ${agreement.title} for ${agreement.production}`,
    body: `Hi ${firstName(r.signer_name)},\n\nThank you for signing. Your signed ${agreement.title} for ${agreement.production} is attached as a PDF for your records. It includes a signing certificate showing when and how it was signed.\n\nWe'll be in touch with next steps and your production materials.\n\nWarmly,\nBLEUSKM Studios`,
    idempotencyKey: `contract-signed:${r.id}`, contactId: r.contact_id, productionId: r.production_id, section: "documents",
    templateKey: "contract_signed_copy", related: { table: "contract_requests", id: r.id }, activityKind: "contract.copy_sent",
    activitySummary: `Signed copy emailed to ${r.signer_email}`,
    attachments: [{ name: filename, content: Buffer.from(pdf).toString("base64") }],
  });
  return NextResponse.json({ ok: true });
}
