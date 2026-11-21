import Link from "next/link";
import { notFound } from "next/navigation";
import { dbCheck, enabledSections, productionBySlug } from "@/lib/hub/data";
import { PRODUCTION_SECTIONS } from "@/lib/hub/access";
import { SECTION_LABEL } from "@/lib/hub/labels";
import { NoAccess, NotBuiltYet, PageHead } from "@/components/hub/Page";

export default async function ProductionSection({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params;
  if (!(PRODUCTION_SECTIONS as readonly string[]).includes(section)) notFound();
  const p = await productionBySlug(slug);
  if (!p) return <NoAccess what="this production" />;
  // The database answers, not the menu: a typed address gets the same check.
  const [canView, enabled] = await Promise.all([dbCheck(p.id, section, "view"), enabledSections(p.id)]);
  if (!canView) return <NoAccess what={`${SECTION_LABEL[section]} on ${p.title}`} />;
  return (
    <>
      <PageHead title={SECTION_LABEL[section]} lead={<Link className="link" href={`/productions/${p.slug}`}>{p.title}</Link>} />
      {!enabled.has(section) && <p className="msg">This section is switched off for this production. Only you can see it.</p>}
      <NotBuiltYet what={SECTION_LABEL[section]} />
    </>
  );
}
