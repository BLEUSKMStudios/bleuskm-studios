import Link from "next/link";
import { dbCheck } from "@/lib/hub/data";
import { marketingAudiences } from "@/lib/campaigns/data";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

export const metadata = { title: "New campaign · BLEUSKM Studio OS" };

export default async function NewCampaignPage() {
  if (!(await dbCheck(null, "communications", "edit"))) return <NoAccess what="writing campaigns (Studio-level Communications edit access)" />;
  const audiences = await marketingAudiences();
  return (
    <>
      <PageHead title="New campaign" lead="Write it, send yourself a test, submit it, and it goes out once the owner approves the exact wording.">
        <Link className="btn btn-inline btn-quiet" href="/communications?tab=campaigns">All campaigns</Link>
      </PageHead>
      <section className="panel">
        {audiences.length ? <CampaignForm audiences={audiences} /> : <p className="msg warn">There are no opt-in audiences yet.</p>}
      </section>
    </>
  );
}
