import "server-only";

import { isAccessLevel, isSectionKey, isUuid, STUDIO_SECTIONS, type AccessLevel, type SectionKey } from "./sections.ts";

/**
 * Server-side permission checks.
 *
 * The database is the source of truth: every table already refuses rows the
 * caller may not see (Row Level Security). These helpers let server code ask
 * the same question *before* doing work, and they are mandatory for code that
 * runs with the secret key, which bypasses Row Level Security.
 *
 * Every check fails closed: bad input, a missing user, a network error or an
 * unexpected answer all mean "no access".
 */

/** Minimal shape of the Supabase client used here (keeps this module testable). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** `null` means Studio level (studio-wide records). */
export type Scope = string | null;

export class AccessDeniedError extends Error {
  readonly status = 403;
  readonly section: string;
  readonly level: string;
  readonly scope: Scope;
  constructor(section: string, level: string, scope: Scope) {
    super("You do not have access to this.");
    this.name = "AccessDeniedError";
    this.section = section;
    this.level = level;
    this.scope = scope;
  }
}

function validRequest(scope: Scope, section: unknown, level: unknown): section is SectionKey {
  if (!isSectionKey(section) || !isAccessLevel(level)) return false;
  if (scope === null) return STUDIO_SECTIONS.includes(section);
  return isUuid(scope);
}

async function ask(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await client.rpc(fn, args);
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Checks the signed-in caller (the client carries the user's session).
 * Uses the database function `check_access`.
 */
export async function checkAccess(
  client: RpcClient,
  scope: Scope,
  section: SectionKey,
  level: AccessLevel,
): Promise<boolean> {
  if (!validRequest(scope, section, level)) return false;
  return ask(client, "check_access", { p_production: scope, p_section: section, p_level: level });
}

/** Like checkAccess, but throws AccessDeniedError (HTTP 403) when denied. */
export async function requireAccess(
  client: RpcClient,
  scope: Scope,
  section: SectionKey,
  level: AccessLevel,
): Promise<void> {
  if (!(await checkAccess(client, scope, section, level))) {
    throw new AccessDeniedError(section, level, scope);
  }
}

/**
 * Checks a specific user from server code that holds the secret key
 * (integrations such as Drive, Brevo or the Airtable sync). Uses the
 * service-role-only database function `check_access_for`.
 */
export async function checkAccessFor(
  adminClient: RpcClient,
  userId: string,
  scope: Scope,
  section: SectionKey,
  level: AccessLevel,
): Promise<boolean> {
  if (!isUuid(userId) || !validRequest(scope, section, level)) return false;
  return ask(adminClient, "check_access_for", {
    p_user: userId,
    p_production: scope,
    p_section: section,
    p_level: level,
  });
}

/** Like checkAccessFor, but throws AccessDeniedError (HTTP 403) when denied. */
export async function requireAccessFor(
  adminClient: RpcClient,
  userId: string,
  scope: Scope,
  section: SectionKey,
  level: AccessLevel,
): Promise<void> {
  if (!(await checkAccessFor(adminClient, userId, scope, section, level))) {
    throw new AccessDeniedError(section, level, scope);
  }
}
