import { NextResponse } from "next/server";
import { inviteByToken } from "@/lib/hub/selftape-public";
import { MAX_SELFTAPE_FILES, SELFTAPE_BUCKET, cleanTapeLink, pathBelongs, selftapeType } from "@/lib/hub/selftape";
import { sendTransactional } from "@/lib/hub/mailer";
import { render } from "@/lib/hub/templates";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";

// Step 2: record the uploaded file (or a link) on the applicant's profile,
// move them to "Self-tape received" and send one receipt email.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (writeBlockReason()) return NextResponse.json({ ok: false, error: "Uploads are switched off on this preview." }, { status: 403 });
  const { token } = await params;
  const found = await inviteByToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 404 });
  const { admin, invite } = found;
  if (invite.state === "expired" || invite.state === "cancelled") return NextResponse.json({ ok: false, error: "This link is no longer open." }, { status: 410 });
  if (invite.files >= MAX_SELFTAPE_FILES) return NextResponse.json({ ok: false, error: `You can send up to ${MAX_SELFTAPE_FILES} files.` }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { path?: unknown; link?: unknown; note?: unknown };
  const note = String(body.note ?? "").trim().slice(0, 200) || null;

  let material: Record<string, unknown>;
  if (typeof body.path === "string" && body.path) {
    const path = body.path;
    if (!pathBelongs(path, invite.applicationId, invite.id)) return NextResponse.json({ ok: false, error: "Unknown upload." }, { status: 400 });
    const [folder, file] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
    const { data: listed } = await admin.storage.from(SELFTAPE_BUCKET).list(folder, { search: file, limit: 5 });
    const obj = (listed ?? []).find((o) => o.name === file);
    if (!obj) return NextResponse.json({ ok: false, error: "The file didn't arrive. Try the upload again." }, { status: 400 });
    material = {
      application_id: invite.applicationId, production_id: invite.productionId, kind: "self_tape", storage_bucket: SELFTAPE_BUCKET,
      storage_path: path, file_name: file.replace(/^[a-z0-9]+-/, ""), mime_type: selftapeType(file), size_bytes: (obj.metadata as { size?: number } | null)?.size ?? null,
      label: note, invitation_id: invite.id,
    };
  } else {
    if (!invite.allowLinks) return NextResponse.json({ ok: false, error: "Please upload the file." }, { status: 400 });
    const link = cleanTapeLink(String(body.link ?? ""));
    if (!link) return NextResponse.json({ ok: false, error: "Paste an https:// link to your video." }, { status: 400 });
    material = { application_id: invite.applicationId, production_id: invite.productionId, kind: "self_tape", url: link, label: note ?? "Self-tape link", invitation_id: invite.id };
  }
  const { error } = await admin.from("casting_materials").insert(material);
  if (error) {
    console.error(`[selftape] could not record material: ${error.code}`);
    return NextResponse.json({ ok: false, error: "Couldn't save your self-tape. Try again." }, { status: 502 });
  }
  const first = invite.status !== "submitted";
  const now = new Date().toISOString();
  await admin.from("selftape_invitations").update({ status: "submitted", submitted_at: now }).eq("id", invite.id);
  const { data: app } = await admin.from("casting_applications").select("status").eq("id", invite.applicationId).single();
  if (app && ["submitted", "reviewing", "shortlisted", "selftape_invited", "on_hold"].includes(app.status as string)) {
    await admin.from("casting_applications").update({ status: "selftape_received" }).eq("id", invite.applicationId);
  }
  await admin.from("activity").insert({
    production_id: invite.productionId, section: "casting", contact_id: invite.contactId, kind: "selftape.received",
    summary: `Self-tape ${material.url ? "link" : "file"} received for ${invite.role || "the role"}`, subject_table: "selftape_invitations", subject_id: invite.id,
  });

  // One receipt per invitation.
  if (first) {
    const { data: t } = await admin.from("casting_templates").select("subject, body").eq("production_id", invite.productionId).eq("key", "selftape_received").maybeSingle();
    if (t) {
      const vars = { first_name: invite.firstName, role: invite.role, film: invite.film };
      await sendTransactional(admin, {
        identityKey: invite.crew ? "crew" : "casting", to: { email: invite.email, name: invite.fullName },
        subject: render(t.subject as string, vars), body: render(t.body as string, vars),
        idempotencyKey: `selftape-received:${invite.id}`, contactId: invite.contactId, productionId: invite.productionId,
        section: "casting", templateKey: "selftape_received", related: { table: "casting_applications", id: invite.applicationId },
        activityKind: "email.selftape_received",
      });
    }
  }
  return NextResponse.json({ ok: true });
}
