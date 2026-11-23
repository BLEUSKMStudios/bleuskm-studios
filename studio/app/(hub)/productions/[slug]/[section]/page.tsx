import { notFound } from "next/navigation";
import { dbCheck, productionBySlug } from "@/lib/hub/data";
import { moduleByKey } from "@/lib/hub/modules";
import { NoAccess } from "@/components/hub/Page";
import { ModuleView } from "@/components/hub/ModuleView";

// A module inside one production's workspace, e.g. /productions/the-final-hand/call-sheets.
export default async function ProductionModule({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params;
  const def = moduleByKey(section);
  if (!def || def.studioLevel === "only") notFound();
  const p = await productionBySlug(slug);
  if (!p) return <NoAccess what="this production" />;
  // The database answers, not the menu: a typed address gets the same check.
  if (!(await dbCheck(p.id, def.section, "view"))) return <NoAccess what={`${def.title} on ${p.title}`} />;
  return <ModuleView def={def} production={p} />;
}
