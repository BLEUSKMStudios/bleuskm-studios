"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { readEmailLink } from "@/lib/auth/link";

/**
 * Uses the one-time link. This runs only when the person presses Continue, so
 * email scanners and link-tracking services that open the link first cannot
 * use it up.
 */
export async function acceptEmailLink(formData: FormData) {
  const link = readEmailLink(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])));
  const supabase = await createServerSupabase();
  let ok = false;
  if (link.kind === "token") {
    ok = !(await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash })).error;
  } else if (link.kind === "code") {
    ok = !(await supabase.auth.exchangeCodeForSession(link.code)).error;
  }
  if (!ok || link.kind === "invalid") redirect("/login?reason=link-expired");
  redirect(link.next);
}
