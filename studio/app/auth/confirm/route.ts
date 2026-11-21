import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/decide";

// Landing point for links in invitation and password-reset emails.
const ALLOWED: EmailOtpType[] = ["invite", "recovery", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeNextPath(params.get("next"), "/set-password");
  const supabase = await createServerSupabase();

  let ok = false;
  if (tokenHash && type && ALLOWED.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  const to = request.nextUrl.clone();
  to.search = "";
  to.pathname = ok ? next : "/login";
  if (!ok) to.searchParams.set("reason", "link-expired");
  return NextResponse.redirect(to);
}
