import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { decide, type Decision } from "./decide.ts";

export type Me = { id: string; email: string; fullName: string; isOwner: boolean };

/**
 * Checks the session with Supabase (never trusting the browser alone) and
 * returns the facts the access rules need.
 */
export async function loadSession() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { supabase, me: null, decision: decide({ signedIn: false, profile: null, hasAuthenticator: false, passedAuthenticator: false }) };

  const [{ data: profile }, { data: aal }, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, is_owner, status").eq("id", user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const decision: Decision = decide({
    signedIn: true,
    profile: profile ? { isOwner: profile.is_owner, status: profile.status } : null,
    hasAuthenticator: (factors?.totp ?? []).some((f) => f.status === "verified"),
    passedAuthenticator: aal?.currentLevel === "aal2",
  });
  const me: Me | null = profile
    ? { id: profile.id, email: profile.email, fullName: profile.full_name, isOwner: profile.is_owner }
    : null;
  return { supabase, me, decision };
}

/** Use at the top of every hub page. Sends anyone not fully signed in to the right step. */
export async function requireSignedIn(): Promise<Me> {
  const { me, decision } = await loadSession();
  switch (decision.kind) {
    case "allow":
      return me!;
    case "sign-in":
      redirect("/login");
    case "blocked":
      redirect("/auth/signout?reason=blocked");
    case "set-up-authenticator":
      redirect("/mfa/setup");
    case "verify-authenticator":
      redirect("/mfa");
  }
}

/** Owner-only pages (Settings). Everyone else gets a plain "not found". */
export async function requireOwner(): Promise<Me> {
  const me = await requireSignedIn();
  if (!me.isOwner) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return me;
}
