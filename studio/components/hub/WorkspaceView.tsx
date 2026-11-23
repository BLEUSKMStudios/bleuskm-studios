import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { moduleByKey } from "@/lib/hub/modules";
import { tabFor, type Workspace } from "@/lib/hub/workspaces";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ModuleView } from "@/components/hub/ModuleView";
import { CalendarView } from "@/components/hub/views/CalendarView";
import { CrewView } from "@/components/hub/views/CrewView";
import { CastingView } from "@/components/hub/views/CastingView";
import { ApplicationsView } from "@/components/hub/views/ApplicationsView";

export type WorkspaceSearch = { tab?: string; production?: string; status?: string; q?: string; call?: string; role?: string; past?: string };

/** One sidebar destination with internal tabs (Scheduling, Crew, Casting, Post-Production …). */
export async function WorkspaceView({ ws, search }: { ws: Workspace; search: WorkspaceSearch }) {
  const { me, grants } = await hubContext();
  const may = (section: string) => me.isOwner || holdsSection(grants, section);
  const tabs = ws.tabs.filter((t) => may(t.section ?? ws.section));
  if (tabs.length === 0) return <NoAccess what={ws.title} />;
  const tab = tabFor({ ...ws, tabs }, search.tab);
  const href = (key: string) => `/${ws.key}?tab=${key}`;

  let body: React.ReactNode;
  if (tab.module) {
    const def = moduleByKey(tab.module);
    body = def ? <ModuleView def={def} filter={search.production} embedded listHref={href(tab.key)} /> : null;
  } else if (tab.view === "calendar") {
    body = <CalendarView search={search} />;
  } else if (tab.view?.startsWith("crew-")) {
    body = <CrewView view={tab.view} search={search} listHref={href(tab.key)} />;
  } else if (tab.view?.startsWith("casting-")) {
    body = <CastingView view={tab.view} search={search} listHref={href(tab.key)} />;
  } else if (tab.view?.startsWith("applications-")) {
    body = <ApplicationsView kind={tab.view === "applications-crew" ? "crew" : "cast"} search={search} listHref={href(tab.key)} />;
  }

  return (
    <>
      <PageHead title={ws.title} lead={ws.lead} />
      {tabs.length > 1 && (
        <nav className="subtabs ws-tabs" aria-label={`${ws.title} views`}>
          {tabs.map((t) => (
            <Link key={t.key} href={href(t.key)} aria-current={t.key === tab.key ? "page" : undefined} className={t.key === tab.key ? "on" : undefined}>{t.label}</Link>
          ))}
        </nav>
      )}
      {body}
    </>
  );
}
