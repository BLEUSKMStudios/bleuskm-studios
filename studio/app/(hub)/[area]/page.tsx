import Link from "next/link";
import { notFound } from "next/navigation";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { MAIN_AREAS } from "@/lib/hub/access";
import { LEVEL_LABEL, SECTION_LABEL } from "@/lib/hub/labels";
import { NoAccess, NotBuiltYet, PageHead } from "@/components/hub/Page";

// Casting, Crew, Scheduling, Locations, Documents and Communications.
export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!(MAIN_AREAS as readonly string[]).includes(area)) notFound();
  const { me, grants, productions } = await hubContext();
  const mine = grants.filter((g) => g.section_key === area);
  // Studio level is checked with the database; production grants come from the person's own rows.
  const studio = await dbCheck(null, area, "view");
  if (!me.isOwner && !studio && mine.length === 0) return <NoAccess what={SECTION_LABEL[area]} />;
  const title = (id: string) => productions.find((p) => p.id === id);
  return (
    <>
      <PageHead title={SECTION_LABEL[area]} />
      <NotBuiltYet what={SECTION_LABEL[area]} />
      {!me.isOwner && (
        <section className="panel">
          <h2>Your access</h2>
          <ul className="plain">
            {mine.map((g) => {
              const p = g.production_id ? title(g.production_id) : null;
              return (
                <li key={g.id}>
                  {g.production_id === null ? "Studio level" : p ? <Link className="link" href={`/productions/${p.slug}/${area}`}>{p.title}</Link> : "A production"}: {LEVEL_LABEL[g.level]}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
