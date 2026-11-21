import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createServerSupabase();
  // A banned (deactivated) account can't sign out on the server, so clear
  // this browser's session cookies in that case too.
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  to.searchParams.set("reason", request.nextUrl.searchParams.get("reason") === "blocked" ? "blocked" : "signed-out");
  return NextResponse.redirect(to, { status: 303 });
}

export const POST = signOut;
// GET is used only for the automatic sign-out of blocked accounts.
export const GET = signOut;
