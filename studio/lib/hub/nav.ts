// The lifecycle menu. Pure code (unit-tested): which groups and links a
// person sees. Hiding a link is only a convenience; every page checks access
// with the database again.

import type { Grant } from "./access.ts";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  /** Permission section. null = everyone signed in. */
  section: string | null;
  ownerOnly?: boolean;
  /** Further sections that also open this item (any one is enough). */
  alsoSections?: readonly string[];
};
export type NavGroup = { key: string; label: string; items: NavItem[] };

export const NAV: readonly NavGroup[] = [
  {
    // Active productions, deadlines, notifications and recent activity are
    // sections of the overview page, so the overview is the only link.
    key: "dashboard", label: "Dashboard", items: [
      { key: "overview", label: "Studio overview", href: "/", section: null },
    ],
  },
  {
    key: "development", label: "Development", items: [
      { key: "productions", label: "Projects", href: "/productions", section: null },
      { key: "scripts", label: "Scripts & Treatments", href: "/scripts", section: "script_breakdown" },
      { key: "resources", label: "Development resources", href: "/resources", section: "development" },
    ],
  },
  {
    key: "preproduction", label: "Pre-Production", items: [
      // Applications are shown to anyone with Casting or Crew access (see navFor).
      { key: "applications", label: "Applications", href: "/applications", section: "casting" }, // applications are read under Casting access (crew too)
      { key: "casting", label: "Casting", href: "/casting", section: "casting" },
      { key: "crew", label: "Crew", href: "/crew", section: "crew" },
      { key: "locations", label: "Locations", href: "/locations", section: "locations" },
      { key: "scheduling", label: "Scheduling", href: "/scheduling", section: "scheduling" },
      { key: "documents", label: "Documents", href: "/documents", section: "documents" },
    ],
  },
  {
    key: "production", label: "Production", items: [
      { key: "tracking", label: "Production Tracking", href: "/tracking", section: "tasks" },
    ],
  },
  {
    key: "post", label: "Post-Production", items: [
      { key: "post", label: "Editing & Deliverables", href: "/post", section: "post" },
    ],
  },
  {
    key: "distribution", label: "Distribution", items: [
      { key: "distribution", label: "Festivals & Releases", href: "/distribution", section: "distribution" },
    ],
  },
  {
    key: "operations", label: "Studio Operations", items: [
      { key: "communications", label: "Communications", href: "/communications", section: "communications" },
      { key: "contacts", label: "Contacts", href: "/contacts", section: "contacts" },
      { key: "settings", label: "Settings & Administration", href: "/settings", section: null, ownerOnly: true },
    ],
  },
];

/** Pages that live inside another menu entry (internal tabs), for highlighting it. */
export const NAV_ALIASES: Record<string, string> = {
  "/shoot-schedule": "/scheduling",
  "/call-sheets": "/scheduling",
  "/editing": "/post",
  "/deliverables": "/post",
  "/festivals": "/distribution",
  "/releases": "/distribution",
  "/notes": "/tracking",
  "/administration": "/settings",
};

/** True when this person holds any grant on the section (any production or Studio level). */
export function holdsSection(grants: readonly Grant[], section: string): boolean {
  return grants.some((g) => g.section_key === section);
}

/** The menu for one person: items they may open, and only groups with items. */
export function navFor(isOwner: boolean, grants: readonly Grant[]): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.ownerOnly) return isOwner;
      if (i.section === null) return true;
      return isOwner || [i.section, ...(i.alsoSections ?? [])].some((s) => holdsSection(grants, s));
    }),
  })).filter((g) => g.items.length > 0);
}

/** The group a path belongs to (for opening it by default). */
export function groupForPath(path: string): string | null {
  const raw = path.split("#")[0].split("?")[0] || "/";
  const alias = Object.keys(NAV_ALIASES).find((a) => raw === a || raw.startsWith(`${a}/`));
  const clean = alias ? NAV_ALIASES[alias] + raw.slice(alias.length) : raw;
  let best: { group: string; len: number } | null = null;
  for (const g of NAV) {
    for (const i of g.items) {
      const href = i.href.split("#")[0] || "/";
      const hit = href === "/" ? clean === "/" : clean === href || clean.startsWith(`${href}/`);
      if (hit && (!best || href.length > best.len)) best = { group: g.key, len: href.length };
    }
  }
  return best?.group ?? null;
}
