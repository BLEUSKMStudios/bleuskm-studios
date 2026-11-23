// Workspaces: one menu entry with internal tabs, so no feature appears twice
// in the sidebar. Pure code (unit-tested).
//
// A tab shows either a module's list (module) or a purpose-built view (view).
// Old addresses of tab modules (e.g. /call-sheets) open the workspace tab.

import type { SectionKey } from "../sections.ts";

export type WorkspaceTab = { key: string; label: string; module?: string; view?: string; section?: SectionKey };
export type Workspace = { key: string; title: string; lead: string; section: SectionKey; tabs: readonly WorkspaceTab[] };

export const WORKSPACES: readonly Workspace[] = [
  {
    key: "scheduling", title: "Scheduling", section: "scheduling",
    lead: "One calendar for every production: milestones, meetings, deadlines, shoot days and call sheets.",
    tabs: [
      { key: "calendar", label: "Master calendar", view: "calendar" },
      { key: "events", label: "Milestones, meetings & deadlines", module: "scheduling" },
      { key: "shoot-days", label: "Shoot schedules", module: "shoot-schedule" },
      { key: "call-sheets", label: "Call sheets", module: "call-sheets" },
    ],
  },
  {
    key: "post", title: "Post-Production", section: "post",
    lead: "Edit progress and delivery, per production.",
    tabs: [
      { key: "editing", label: "Editing progress", module: "editing" },
      { key: "deliverables", label: "Deliverables", module: "deliverables" },
    ],
  },
  {
    key: "distribution", title: "Distribution", section: "distribution",
    lead: "Festival strategy and submissions, and every release.",
    tabs: [
      { key: "festivals", label: "Festivals", module: "festivals" },
      { key: "releases", label: "Releases", module: "releases" },
    ],
  },
  {
    key: "crew", title: "Crew", section: "crew",
    lead: "Crew management for each production. New crew applications arrive in Applications.",
    tabs: [
      { key: "roster", label: "Roster & positions", module: "crew-roster" },
      { key: "onboarding", label: "Onboarding & confirmations", view: "crew-onboarding" },
      { key: "guides", label: "Department guides", module: "crew-guides", section: "documents" },
      { key: "agreements", label: "Agreements", module: "crew-agreements", section: "documents" },
      { key: "comms", label: "Communications & templates", view: "crew-comms", section: "casting" },
    ],
  },
  {
    key: "casting", title: "Casting", section: "casting",
    lead: "Casting management for each production. New cast applications arrive in Applications.",
    tabs: [
      { key: "roles", label: "Roles & breakdowns", view: "casting-roles" },
      { key: "auditions", label: "Auditions & callbacks", view: "casting-auditions" },
      { key: "evaluations", label: "Evaluations & selections", view: "casting-evaluations" },
      { key: "roster", label: "Cast roster", view: "casting-roster" },
      { key: "comms", label: "Communications & templates", view: "casting-comms" },
    ],
  },
  {
    key: "applications", title: "Applications", section: "casting",
    lead: "Every cast and crew application in one place, from the website and from imports.",
    tabs: [
      { key: "cast", label: "Cast applications", view: "applications-cast" },
      { key: "crew", label: "Crew applications", view: "applications-crew" },
    ],
  },
];

export function workspaceByKey(key: string): Workspace | undefined {
  return WORKSPACES.find((w) => w.key === key);
}

/** The tab to show: the one asked for, else the first. */
export function tabFor(ws: Workspace, key: string | undefined): WorkspaceTab {
  return ws.tabs.find((t) => t.key === key) ?? ws.tabs[0];
}

/** Where a module that now lives in a workspace tab opens, e.g. call-sheets -> /scheduling?tab=call-sheets. */
export function workspaceHrefForModule(moduleKey: string): string | null {
  for (const ws of WORKSPACES) {
    if (ws.key === moduleKey) continue;
    const tab = ws.tabs.find((t) => t.module === moduleKey);
    if (tab) return `/${ws.key}?tab=${tab.key}`;
  }
  return null;
}

/** A module's list page: its workspace tab when it has one, else /<module>. */
export function listHrefForModule(moduleKey: string): string {
  if (workspaceByKey(moduleKey)) {
    const ws = workspaceByKey(moduleKey)!;
    const tab = ws.tabs.find((t) => t.module === moduleKey);
    return tab ? `/${ws.key}?tab=${tab.key}` : `/${ws.key}`;
  }
  return workspaceHrefForModule(moduleKey) ?? `/${moduleKey}`;
}
