import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { enabledSections, hubContext, productionBySlug } from "@/lib/hub/data";
import { PRODUCTION_SECTIONS, levelIn } from "@/lib/hub/access";
import { LEVEL_LABEL, SECTION_LABEL, STAGES, STAGE_LABEL, STAGE_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL, type Stage, type StageStatus } from "@/lib/hub/labels";
import { NoAccess, PageHead } from "@/components/hub/Page";

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
  const tabs = PRODUCTION_SECTIONS.filter((s) => enabled.has(s) && (me.isOwner || levelIn(grants, p.id, s) !== "none"));
  return (
    <>
      <PageHead title={p.title} lead={`${TYPE_LABEL[p.type]} · ${STATUS_LABEL[p.status]} · ${STAGE_LABEL[p.current_stage]}`}>
        {me.isOwner && <Link className="btn btn-quiet btn-inline" href={`/settings/productions/${p.slug}`}>Production settings</Link>}
      </PageHead>
      <nav className="tabs" aria-label="Sections">
        {tabs.map((s) => (
          <Link key={s} href={`/productions/${p.slug}/${s}`}>
            {SECTION_LABEL[s]}
            {!me.isOwner && <span className="tab-level">{LEVEL_LABEL[levelIn(grants, p.id, s)]}</span>}
          </Link>
        ))}
        {tabs.length === 0 && <p className="small">No sections are open to you in this production.</p>}
      </nav>
      <section className="panel">
        <h2>Lifecycle</h2>
        <ol className="stages">
          {STAGES.map((s) => (
            <li key={s} className={`stage stage-${stages.get(s) ?? "not_started"}${s === p.current_stage ? " current" : ""}`}>
              <span>{STAGE_LABEL[s]}</span>
              <span className="small">{STAGE_STATUS_LABEL[stages.get(s) ?? "not_started"]}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
