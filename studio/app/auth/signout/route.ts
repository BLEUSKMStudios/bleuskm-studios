import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  to.searchParams.set("reason", request.nextUrl.searchParams.get("reason") === "blocked" ? "blocked" : "signed-out");
  return NextResponse.redirect(to, { status: 303 });
}

export const POST = signOut;
// GET is used only for the automatic sign-out of blocked accounts.
export const GET = signOut;
