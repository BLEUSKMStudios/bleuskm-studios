import { NextResponse } from "next/server";

import { recordIntake } from "@/lib/hub/intake";
import { parseIntake, secretMatches } from "@/lib/hub/intake-rules";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-to-server endpoint for the public website. The website's own API
// functions call it after saving a form, with a shared secret. Browsers
// never call it, and it never returns any stored data.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!secretMatches(auth, process.env.STUDIO_INTAKE_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const raw = await request.json().catch(() => null);
  const parsed = parseIntake(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  try {
    const r = await recordIntake(admin, parsed.input);
    return NextResponse.json({ ok: true, duplicate: r.duplicate, confirmation: r.confirmation });
  } catch (e) {
    console.error(`[intake] ${parsed.input.kind} failed: ${(e as Error).message}`);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 502 });
  }
}
