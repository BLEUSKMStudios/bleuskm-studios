// Deployment facts that change what the hub may do. Pure code (unit-tested).
//
// Preview builds use the same Supabase project as the live hub and website
// (Free plan: one project). So a Preview is read-only by default: it can sign
// in and show everything, but every save, invite and email is refused. Once a
// separate staging database is connected to Previews, set
// STUDIO_PREVIEW_WRITES=allow on the Preview environment only.

export type Env = Record<string, string | undefined>;

export function isPreview(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}

export const PREVIEW_READ_ONLY =
  "This Preview build is read-only because it is connected to the live database. Changes are saved only on the live Studio OS.";

/** Why writes are blocked here, or null when they're allowed. */
export function writeBlockReason(env: Env = process.env): string | null {
  if (isPreview(env) && (env.STUDIO_PREVIEW_WRITES ?? "").trim() !== "allow") return PREVIEW_READ_ONLY;
  return null;
}

/**
 * Real outgoing email from Communications (Zoho replies) is off unless the
 * owner turns it on with COMMS_SEND_ENABLED=on, and never on a read-only Preview.
 * Casting emails keep their own existing Brevo flow.
 */
export function commsSendBlockReason(env: Env = process.env): string | null {
  const w = writeBlockReason(env);
  if (w) return w;
  if ((env.COMMS_SEND_ENABLED ?? "").trim() !== "on") {
    return "Sending from Communications is switched off (COMMS_SEND_ENABLED is not \"on\"). Nothing was sent.";
  }
  return null;
}

export type Integration = {
  key: string;
  name: string;
  configured: boolean;
  missing: string[];
  purpose: string;
};

const has = (env: Env, k: string) => !!(env[k] ?? "").trim();

/** Which integrations are configured for this deployment (names only, never values). */
export function integrations(env: Env = process.env): Integration[] {
  const check = (key: string, name: string, vars: string[], purpose: string): Integration => {
    const missing = vars.filter((v) => !has(env, v));
    return { key, name, configured: missing.length === 0, missing, purpose };
  };
  return [
    check("supabase", "Supabase", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "Database, sign-in and permissions."),
    check("supabase-admin", "Supabase (server tasks)", ["SUPABASE_SECRET_KEY"], "Invites, private file links and imports."),
    check("brevo", "Brevo", ["BREVO_KEY"], "Casting and crew emails, templates, campaigns and lists."),
    check("zoho", "Zoho Mail", ["ZOHO_MAIL_USER", "ZOHO_MAIL_APP_PASSWORD"], "Studio inbox and replies in Communications."),
    check("drive", "Google Drive", [], "Files stay in Drive; records link to them. No key needed."),
  ];
}
