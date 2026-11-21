import { requireOwner } from "@/lib/auth/session";
import { createProduction } from "@/lib/hub/production-actions";
import { PageHead } from "@/components/hub/Page";
import { ProductionForm } from "@/components/hub/ProductionForm";

export const metadata = { title: "New production · BLEUSKM Studio OS" };

export default async function NewProduction() {
  await requireOwner();
  return (
    <>
      <PageHead title="New production" lead="Every production section is switched on to start. You can turn sections off and add departments in its settings." />
      <section className="panel narrow">
        <ProductionForm action={createProduction} submit="Create production" />
      </section>
    </>
  );
}
