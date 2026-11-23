import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { PageHead } from "@/components/hub/Page";
import { ProductionTable } from "@/components/hub/ProductionTable";

export const metadata = { title: "Productions · BLEUSKM Studio OS" };

export default async function ProductionsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { me, productions } = await hubContext();
  const showArchived = (await searchParams).show === "archived";
  const list = productions.filter((p) => (p.status === "archived") === showArchived);
  const archivedCount = productions.filter((p) => p.status === "archived").length;
  return (
    <>
      <PageHead title="Productions" lead={showArchived ? "Archived productions" : "Productions you can open"}>
        {me.isOwner && <Link className="btn btn-inline" href="/productions/new">New production</Link>}
      </PageHead>
      <section className="panel">
        {list.length > 0 ? <ProductionTable productions={list} /> : <p className="small">{showArchived ? "Nothing is archived." : "No productions to show yet."}</p>}
        {(archivedCount > 0 || showArchived) && (
          <p className="small" style={{ marginTop: 12 }}>
            {showArchived ? <Link className="link" href="/productions">Back to current productions</Link> : <Link className="link" href="/productions?show=archived">Show archived ({archivedCount})</Link>}
          </p>
        )}
      </section>
    </>
  );
}
