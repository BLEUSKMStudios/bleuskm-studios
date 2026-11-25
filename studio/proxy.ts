import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the sign-in session fresh on every request and sends signed-out
// visitors to the sign-in page. Each page still checks access on the server
// itself (lib/auth/session.ts); this is only the first gate.
// /api/intake checks its own server secret (the website calls it). /upload,
// /sign, /d (materials) and /cs (call sheets) and their APIs are personal
// links for applicants, signers, cast and crew: each
// checks its own secret token and shows only that person's invitation.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm", "/auth/signout", "/robots.txt", "/api/intake", "/upload", "/api/selftape", "/sign", "/api/sign", "/d", "/cs", "/u"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!data.user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
