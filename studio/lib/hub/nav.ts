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
};
export type NavGroup = { key: string; label: string; items: NavItem[] };

export const NAV: readonly NavGroup[] = [
  {
    key: "dashboard", label: "Dashboard", items: [
      { key: "overview", label: "Studio overview", href: "/", section: null },
      { key: "active", label: "Active productions", href: "/#productions", section: null },
      { key: "deadlines", label: "Upcoming deadlines", href: "/#deadlines", section: null },
      { key: "notifications", label: "Notifications", href: "/#notifications", section: null },
      { key: "activity", label: "Recent activity", href: "/#activity", section: null, ownerOnly: true },
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
      { key: "casting", label: "Casting", href: "/casting", section: "casting" },
      { key: "crew", label: "Crew", href: "/crew", section: "crew" },
      { key: "locations", label: "Locations", href: "/locations", section: "locations" },
      { key: "scheduling", label: "Scheduling", href: "/scheduling", section: "scheduling" },
      { key: "documents", label: "Documents", href: "/documents", section: "documents" },
    ],
  },
  {
    key: "production", label: "Production", items: [
      { key: "call-sheets", label: "Call Sheets", href: "/call-sheets", section: "scheduling" },
      { key: "shoot-schedule", label: "Shoot Schedules", href: "/shoot-schedule", section: "scheduling" },
      { key: "tracking", label: "Production Tracking", href: "/tracking", section: "tasks" },
    ],
  },
  {
    key: "post", label: "Post-Production", items: [
      { key: "editing", label: "Editing Progress", href: "/editing", section: "post" },
      { key: "deliverables", label: "Deliverables", href: "/deliverables", section: "post" },
    ],
  },
  {
    key: "distribution", label: "Distribution", items: [
      { key: "festivals", label: "Festivals", href: "/festivals", section: "distribution" },
      { key: "releases", label: "Releases", href: "/releases", section: "distribution" },
    ],
  },
  {
    key: "operations", label: "Studio Operations", items: [
      { key: "communications", label: "Communications", href: "/communications", section: "communications" },
      { key: "contacts", label: "Contacts", href: "/contacts", section: "contacts" },
      { key: "administration", label: "Administration", href: "/administration", section: null, ownerOnly: true },
      { key: "settings", label: "Settings", href: "/settings", section: null, ownerOnly: true },
    ],
  },
];

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
      return isOwner || holdsSection(grants, i.section);
    }),
  })).filter((g) => g.items.length > 0);
}

/** The group a path belongs to (for opening it by default). */
export function groupForPath(path: string): string | null {
  const clean = path.split("#")[0] || "/";
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
