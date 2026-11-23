"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser. Only used for the authenticator app steps. */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
