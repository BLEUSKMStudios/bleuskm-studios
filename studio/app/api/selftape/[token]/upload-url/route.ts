import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { inviteByToken } from "@/lib/hub/selftape-public";
import { MAX_SELFTAPE_FILES, SELFTAPE_BUCKET, maxSelftapeBytes, selftapePath, selftapeType } from "@/lib/hub/selftape";
import { writeBlockReason } from "@/lib/hub/env";

export const dynamic = "force-dynamic";

// Step 1 of an upload: check the personal link, then hand out a one-time
// signed upload address for exactly one file in this invitation's folder.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (writeBlockReason()) return NextResponse.json({ ok: false, error: "Uploads are switched off on this preview." }, { status: 403 });
  const { token } = await params;
  const found = await inviteByToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 404 });
  const { admin, invite } = found;
  if (invite.state === "expired" || invite.state === "cancelled") return NextResponse.json({ ok: false, error: "This link is no longer open." }, { status: 410 });
  if (invite.files >= MAX_SELFTAPE_FILES) return NextResponse.json({ ok: false, error: `You can send up to ${MAX_SELFTAPE_FILES} files.` }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; size?: unknown };
  const name = String(body.name ?? "").slice(0, 200);
  const size = Number(body.size);
  const type = selftapeType(name);
  if (!type) return NextResponse.json({ ok: false, error: "Send a video (MP4, MOV, WEBM, M4V) or a PDF." }, { status: 400 });
  const max = maxSelftapeBytes(process.env);
  if (!Number.isFinite(size) || size <= 0 || size > max) {
    return NextResponse.json({ ok: false, error: `Files can be up to ${Math.round(max / 1048576)} MB. For a larger video, paste a Vimeo, YouTube or Drive link instead.` }, { status: 400 });
  }
  const path = selftapePath(invite.applicationId, invite.id, name, randomBytes(6).toString("hex"));
  const { data, error } = await admin.storage.from(SELFTAPE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ ok: false, error: "The upload couldn't start. Try again." }, { status: 502 });
  return NextResponse.json({ ok: true, path: data.path, token: data.token, contentType: type });
}
