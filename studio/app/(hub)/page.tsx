import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { PageHead } from "@/components/hub/Page";
import { ProductionTable } from "@/components/hub/ProductionTable";

export const metadata = { title: "Studio Overview · BLEUSKM Studio OS" };

export default async function Overview() {
  const { me, productions } = await hubContext();
  const current = productions.filter((p) => p.status !== "archived");
  return (
    <>
      <PageHead title={`Welcome, ${me.fullName.split(" ")[0]}`} lead="Studio Overview" />
      <section className="panel">
        <h2>Your productions</h2>
        {current.length > 0 ? (
          <ProductionTable productions={current} />
        ) : me.isOwner ? (
          <p className="small">No productions yet. <Link className="link" href="/productions/new">Create the first one</Link>.</p>
        ) : (
          <p className="small">You haven't been given access to a production yet. The studio owner can add you.</p>
        )}
      </section>
    </>
  );
}
