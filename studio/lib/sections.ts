// The permission units, mirrored from the `sections` table
// (supabase/migrations/20261121001000_access_foundation.sql).

export const GRANTABLE_SECTIONS = [
  "casting",
  "crew",
  "scheduling",
  "locations",
  "documents",
  "communications",
  "script_breakdown",
  "budget",
  "set_records",
  "tasks",
  "development",
  "post",
  "distribution",
  "contacts",
] as const;

export type SectionKey = (typeof GRANTABLE_SECTIONS)[number];
export type AccessLevel = "view" | "edit";

/** Sections that also exist at Studio level (studio-wide records). */
export const STUDIO_SECTIONS: readonly SectionKey[] = [
  "casting",
  "crew",
  "scheduling",
  "locations",
  "documents",
  "communications",
  "development",
  "contacts",
];

/** Sections that exist only at Studio level (never per production). */
export const STUDIO_ONLY_SECTIONS: readonly SectionKey[] = ["contacts"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (GRANTABLE_SECTIONS as readonly string[]).includes(value);
}

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "view" || value === "edit";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
