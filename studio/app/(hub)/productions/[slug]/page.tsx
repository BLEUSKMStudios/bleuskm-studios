import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { enabledSections, hubContext, productionBySlug } from "@/lib/hub/data";
import { levelIn } from "@/lib/hub/access";
import { MODULES, type ModuleGroup } from "@/lib/hub/modules";
import { countModule } from "@/lib/hub/module-data";
import { LEVEL_LABEL, STAGES, STAGE_LABEL, STAGE_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL, type Stage, type StageStatus } from "@/lib/hub/labels";
import { NoAccess, PageHead } from "@/components/hub/Page";

const GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: "development", label: "Development" },
  { key: "preproduction", label: "Pre-Production" },
  { key: "production", label: "Production" },
  { key: "post", label: "Post-Production" },
  { key: "distribution", label: "Distribution" },
];

// One production's workspace, organized by lifecycle.
export default async function ProductionHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await productionBySlug(slug);
  if (!p) return <NoAccess what="this production" />;
  const { me, grants } = await hubContext();
  const { supabase } = await loadSession();
  const [enabled, { data: stageRows }] = await Promise.all([
    enabledSections(p.id),
    supabase.from("production_stages").select("stage, status").eq("production_id", p.id),
  ]);
  const stages = new Map((stageRows ?? []).map((r) => [r.stage as Stage, r.status as StageStatus]));
  const open = (section: string) => enabled.has(section) && (me.isOwner || levelIn(grants, p.id, section) !== "none");

  type Card = { key: string; title: string; href: string; section: string; count: number | null; lead: string };
  const modules = MODULES.filter((m) => m.studioLevel !== "only" && !m.hidden && open(m.section));
  const counts = await Promise.all(modules.map((m) => countModule(m, p.id)));
  const cards = new Map<ModuleGroup, Card[]>();
  modules.forEach((m, i) => {
    const list = cards.get(m.group) ?? [];
    list.push({ key: m.key, title: m.title, href: `/productions/${p.slug}/${m.key}`, section: m.section, count: counts[i], lead: m.lead });
    cards.set(m.group, list);
  });
  if (open("casting")) {
    const { count } = await supabase.from("casting_applications").select("id", { count: "exact", head: true }).eq("production_id", p.id);
    const list = cards.get("preproduction") ?? [];
    list.unshift({ key: "casting", title: "Casting", href: `/productions/${p.slug}/casting`, section: "casting", count: count ?? 0, lead: "Casting calls, roles, applicants, callbacks and casting emails." });
    cards.set("preproduction", list);
  }
  if (open("set_records")) {
    const list = cards.get("production") ?? [];
    const notes = MODULES.find((m) => m.key === "notes")!;
    list.push({ key: "notes", title: notes.title, href: `/productions/${p.slug}/notes`, section: "set_records", count: await countModule(notes, p.id), lead: notes.lead });
    cards.set("production", list);
  }
  const any = [...cards.values()].some((l) => l.length > 0);

  return (
    <>
      <PageHead title={p.title} lead={`${TYPE_LABEL[p.type]} · ${STATUS_LABEL[p.status]} · Now in ${STAGE_LABEL[p.current_stage]}`}>
        {me.isOwner && <Link className="btn btn-quiet btn-inline" href={`/settings/productions/${p.slug}`}>Production settings</Link>}
      </PageHead>

      <section className="panel" aria-labelledby="h-life">
        <h2 id="h-life">Lifecycle</h2>
        <ol className="stages">
          {STAGES.map((s) => (
            <li key={s} className={`stage stage-${stages.get(s) ?? "not_started"}${s === p.current_stage ? " current" : ""}`} aria-current={s === p.current_stage ? "step" : undefined}>
              <span>{STAGE_LABEL[s]}</span>
              <span className="small">{STAGE_STATUS_LABEL[stages.get(s) ?? "not_started"]}</span>
            </li>
          ))}
        </ol>
      </section>

      {!any && <div className="empty-state panel"><h3>Nothing open to you yet</h3><p className="small">No sections of this production have been shared with you.</p></div>}

      {GROUPS.map((g) => {
        const list = cards.get(g.key) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={g.key} className="ws-group" aria-labelledby={`h-${g.key}`}>
            <h2 id={`h-${g.key}`} className="ws-title">{g.label}</h2>
            <div className="cards">
              {list.map((c) => (
                <Link key={c.key} className="card mod-card" href={c.href}>
                  <div className="mod-head"><h3>{c.title}</h3>{c.count !== null && <span className="count">{c.count}</span>}</div>
                  <p className="small">{c.lead}</p>
                  {!me.isOwner && <span className="tag tone-muted tag-sm">{LEVEL_LABEL[levelIn(grants, p.id, c.section)]}</span>}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
