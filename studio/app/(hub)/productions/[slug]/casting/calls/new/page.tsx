import Link from "next/link";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm } from "@/components/hub/HubForm";
import { saveCall } from "@/lib/hub/casting-actions";
import { castingAccess, callsAndRoles } from "@/lib/hub/casting-data";
import { CallFields } from "../../CallFields";

export default async function NewCall({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { p, canEdit } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canEdit) return <NoAccess what={`editing Casting on ${p.title}`} />;
  const { calls } = await callsAndRoles(p.id);
  const base = `/productions/${p.slug}/casting`;
  return (
    <>
      <PageHead title="New casting call" lead={<Link className="link" href={base}>{p.title} · Casting</Link>} />
      <section className="panel">
        <p className="small">Start as Draft: nothing appears on bleuskm.com until the status is Open and the opening time (if any) has passed.</p>
        <HubForm action={saveCall}>
          <CallFields productionId={p.id} defaultSlug={calls.length ? `${p.slug}-${calls.length + 1}` : p.slug} returnTo={base} />
        </HubForm>
      </section>
    </>
  );
}
