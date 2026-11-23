import { GRANTABLE_SECTIONS, STUDIO_ONLY_SECTIONS, STUDIO_SECTIONS, isUuid, type AccessLevel, type SectionKey } from "../sections.ts";

/** One saved permission: production null = Studio level. */
export type Grant = { id?: string; production_id: string | null; section_key: string; level: AccessLevel };
export type Level = AccessLevel | "none";

/** Main-menu areas that can be granted, in menu order. */
export const MAIN_AREAS: readonly SectionKey[] = STUDIO_SECTIONS;
/** Sections that live inside a production's workspace. */
export const PRODUCTION_SECTIONS: readonly SectionKey[] = GRANTABLE_SECTIONS.filter((s) => !STUDIO_ONLY_SECTIONS.includes(s));

export type MenuItem = { key: string; href: string };

/**
 * The left menu. Overview and Productions for everyone; a main area only
 * when the person holds a grant on it somewhere (or is the owner); Settings
 * for the owner. Hiding is only a convenience: every page checks again.
 */
export function menuFor(isOwner: boolean, grants: readonly Grant[]): MenuItem[] {
  const items: MenuItem[] = [
    { key: "overview", href: "/" },
    { key: "productions", href: "/productions" },
  ];
  for (const area of MAIN_AREAS) {
    if (isOwner || grants.some((g) => g.section_key === area)) items.push({ key: area, href: `/${area}` });
  }
  if (isOwner) items.push({ key: "settings", href: "/settings" });
  return items;
}

/** Highest level a person holds for a section in one scope (null = Studio level). */
export function levelIn(grants: readonly Grant[], scope: string | null, section: string): Level {
  const g = grants.find((x) => x.section_key === section && x.production_id === scope);
  return g ? g.level : "none";
}

// ---------------------------------------------------------------------------
// The permission grid (Settings → User Access)
// ---------------------------------------------------------------------------

export const STUDIO_ROW = "studio";

export function cellName(scope: string | null, section: string): string {
  return `cell:${scope ?? STUDIO_ROW}:${section}`;
}

/** True when this section can be granted in this scope. */
export function cellApplies(scope: string | null, section: string): boolean {
  if (!(GRANTABLE_SECTIONS as readonly string[]).includes(section)) return false;
  return scope === null
    ? (STUDIO_SECTIONS as readonly string[]).includes(section)
    : !(STUDIO_ONLY_SECTIONS as readonly string[]).includes(section);
}

/**
 * Reads the grid a form sent. Only real cells of known productions are
 * accepted; anything else is ignored, so a tampered form can't create odd grants.
 */
export function readGrid(entries: Iterable<[string, unknown]>, productionIds: ReadonlySet<string>): Grant[] {
  const out = new Map<string, Grant>();
  for (const [name, raw] of entries) {
    const m = /^cell:([^:]+):([a-z_]+)$/.exec(name);
    if (!m) continue;
    const scope = m[1] === STUDIO_ROW ? null : m[1];
    const section = m[2];
    if (scope !== null && (!isUuid(scope) || !productionIds.has(scope))) continue;
    if (!cellApplies(scope, section)) continue;
    if (raw !== "view" && raw !== "edit") continue;
    out.set(cellName(scope, section), { production_id: scope, section_key: section, level: raw });
  }
  return [...out.values()];
}

export type GridChanges = {
  insert: Grant[];
  update: { id: string; level: AccessLevel }[];
  remove: string[];
};

/** What has to change to turn the saved grants into the wanted ones. */
export function diffGrants(current: readonly Grant[], wanted: readonly Grant[]): GridChanges {
  const key = (g: Grant) => cellName(g.production_id, g.section_key);
  const want = new Map(wanted.map((g) => [key(g), g]));
  const have = new Map(current.map((g) => [key(g), g]));
  const changes: GridChanges = { insert: [], update: [], remove: [] };
  for (const [k, g] of have) {
    const w = want.get(k);
    if (!w) changes.remove.push(g.id!);
    else if (w.level !== g.level) changes.update.push({ id: g.id!, level: w.level });
  }
  for (const [k, w] of want) if (!have.has(k)) changes.insert.push({ production_id: w.production_id, section_key: w.section_key, level: w.level });
  return changes;
}
