import Link from "next/link";
import { hubContext, type Production } from "@/lib/hub/data";
import { listModule } from "@/lib/hub/module-data";
import { moduleByKey, type ModuleDef } from "@/lib/hub/modules";
import { holdsSection } from "@/lib/hub/nav";
import { writeBlockReason } from "@/lib/hub/env";
import type { Grant } from "@/lib/hub/access";
import type { Me } from "@/lib/auth/session";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ModuleTable } from "@/components/hub/ModuleTable";
import { RecordForm, type ScopeOption } from "@/components/hub/RecordForm";

/** Where this person may add a record of this module (UI only; the server checks again). */
export function scopesFor(def: ModuleDef, me: Me, grants: readonly Grant[], productions: readonly Production[]): ScopeOption[] {
  const canEdit = (scope: string | null) =>
    me.isOwner || grants.some((g) => g.section_key === def.section && g.production_id === scope && g.level === "edit");
  const out: ScopeOption[] = [];
  if (def.studioLevel !== "never" && canEdit(null)) out.push({ value: "", label: "Studio-wide (no production)" });
  if (def.studioLevel !== "only") {
    for (const p of productions) if (p.status !== "archived" && canEdit(p.id)) out.push({ value: p.id, label: p.title });
  }
  return out;
}

/** Related pages shown as tabs above a module (e.g. tracking + notes). */
const RELATED: Record<string, string[]> = {
  tracking: ["tracking", "notes"],
  notes: ["tracking", "notes"],
  // Inside one production's workspace only (studio-wide they are workspace tabs).
  scheduling: ["scheduling", "shoot-schedule", "call-sheets"],
  "shoot-schedule": ["scheduling", "shoot-schedule", "call-sheets"],
  "call-sheets": ["scheduling", "shoot-schedule", "call-sheets"],
  editing: ["editing", "deliverables"],
  deliverables: ["editing", "deliverables"],
  festivals: ["festivals", "releases"],
  releases: ["festivals", "releases"],
};
const ALWAYS_RELATED = new Set(["tracking", "notes"]);

export function RelatedTabs({ current, base, isOwner, grants }: { current: string; base: string; isOwner: boolean; grants: readonly Grant[] }) {
  const keys = RELATED[current];
  if (!keys || (!base && !ALWAYS_RELATED.has(current))) return null;
  const defs = keys.map((k) => moduleByKey(k)!).filter((d) => isOwner || holdsSection(grants, d.section));
  if (defs.length < 2) return null;
  return (
    <nav className="subtabs" aria-label="Related">
      {defs.map((d) => (
        <Link key={d.key} href={`${base}/${d.key}`} aria-current={d.key === current ? "page" : undefined} className={d.key === current ? "on" : undefined}>{d.title}</Link>
      ))}
    </nav>
  );
}

/**
 * One module page, either studio-wide (every production this person can see)
 * or inside one production's workspace.
 */
export async function ModuleView({ def, production, filter, embedded, listHref }: {
  def: ModuleDef; production?: Production; filter?: string;
  /** Shown inside a workspace tab: no page heading. */
  embedded?: boolean;
  /** This list's own address (filters are added to it), e.g. /scheduling?tab=events. */
  listHref?: string;
}) {
  const { me, grants, productions } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, def.section)) return <NoAccess what={def.title} />;

  const scopeFilter = production?.id ?? (filter === "studio" ? "studio" : productions.some((p) => p.id === filter) ? filter : undefined);
  const { rows, error } = await listModule(def, scopeFilter);
  const scopes = scopesFor(def, me, grants, production ? [production] : productions)
    .filter((s) => !production || s.value === production.id);
  const titleOf = (id: string | null) => (id ? productions.find((p) => p.id === id)?.title ?? "—" : "Studio-wide");
  const base = production ? `/productions/${production.slug}` : "";
  const blocked = writeBlockReason();
  const self = listHref ?? `/${def.key}`;
  const withProduction = (v?: string) => (v ? `${self}${self.includes("?") ? "&" : "?"}production=${v}` : self);

  return (
    <>
      {embedded ? <p className="lead-line">{def.lead}</p> : (
        <PageHead
          title={def.title}
          lead={production ? <><Link className="link" href={`/productions/${production.slug}`}>{production.title}</Link> · {def.lead}</> : def.lead}
        />
      )}
      {!embedded && <RelatedTabs current={def.key} base={base} isOwner={me.isOwner} grants={grants} />}

      {!production && def.studioLevel !== "only" && productions.length > 1 && (
        <nav className="filters" aria-label="Filter by production">
          <Link className={`chip${!scopeFilter ? " on" : ""}`} href={withProduction()}>All</Link>
          {def.studioLevel === "allowed" && <Link className={`chip${scopeFilter === "studio" ? " on" : ""}`} href={withProduction("studio")}>Studio-wide</Link>}
          {productions.filter((p) => p.status !== "archived").map((p) => (
            <Link key={p.id} className={`chip${scopeFilter === p.id ? " on" : ""}`} href={withProduction(p.id)}>{p.title}</Link>
          ))}
        </nav>
      )}

      {scopes.length > 0 && !blocked && error !== "setup" && (
        <details className="panel add-panel">
          <summary><span className="btn btn-inline">Add {def.singular}</span></summary>
          <RecordForm module={def.key} fields={def.fields} scopes={production ? undefined : scopes} scope={production?.id} submitLabel={`Add ${def.singular}`} resetOnDone />
        </details>
      )}

      <section className="panel">
        {error === "setup" ? (
          <SetupPending what={def.title} />
        ) : error ? (
          <p className="msg error" role="alert">This list couldn't be loaded. Refresh to try again.</p>
        ) : (
          <ModuleTable
            def={def}
            rows={rows}
            hrefFor={(r) => `/${def.key}/${r.id}`}
            productionTitle={production ? undefined : titleOf}
            empty={
              <>
                <h3>No {def.title.toLowerCase()} yet</h3>
                <p className="small">{scopes.length > 0 ? (blocked ? "Adding is turned off on this Preview build." : `Use “Add ${def.singular}” to create the first one.`) : "Nothing has been shared with you here yet."}</p>
              </>
            }
          />
        )}
      </section>
    </>
  );
}

/** Shown when a table isn't in the database yet (its migration is waiting for approval). */
export function SetupPending({ what }: { what: string }) {
  return (
    <div className="msg warn" role="status">
      <strong>{what} isn&apos;t set up in this database yet.</strong>{" "}
      Its tables are added by the Studio OS database update, which is waiting for the owner&apos;s approval in GitHub. Nothing is broken or lost: the list appears once the update is applied.
    </div>
  );
}
