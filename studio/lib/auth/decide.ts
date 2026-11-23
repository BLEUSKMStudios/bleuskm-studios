/**
 * Decides where a request may go, from facts the server has already checked
 * with Supabase. Pure, so every rule is unit-tested.
 */
export type SessionFacts = {
  signedIn: boolean;
  profile: { isOwner: boolean; status: "active" | "deactivated" } | null;
  /** The person has a verified authenticator app. */
  hasAuthenticator: boolean;
  /** This session has passed the authenticator check ("aal2"). */
  passedAuthenticator: boolean;
};

export type Decision =
  | { kind: "allow" }
  | { kind: "sign-in" } // not signed in
  | { kind: "blocked" } // no profile, or deactivated: sign out and refuse
  | { kind: "set-up-authenticator" } // owner without an authenticator app
  | { kind: "verify-authenticator" }; // has one, but this session hasn't used it

export function decide(f: SessionFacts): Decision {
  if (!f.signedIn) return { kind: "sign-in" };
  if (!f.profile || f.profile.status !== "active") return { kind: "blocked" };
  if (f.hasAuthenticator && !f.passedAuthenticator) return { kind: "verify-authenticator" };
  if (f.profile.isOwner && !f.hasAuthenticator) return { kind: "set-up-authenticator" };
  return { kind: "allow" };
}

/** Only same-site paths are allowed after sign-in links, never another site. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
