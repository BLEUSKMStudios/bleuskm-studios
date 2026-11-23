import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { isOwnerHere } from "@/lib/hub/owner";
import { listPeople } from "@/lib/hub/people";
import { assertUuid } from "@/lib/hub/data";
import { STUDIO_ONLY_SECTIONS } from "@/lib/sections";
import { PRODUCTION_SECTIONS, MAIN_AREAS, cellName, type Grant } from "@/lib/hub/access";
import { SECTION_LABEL, STATUS_LABEL, type ProductionStatus } from "@/lib/hub/labels";
import { copyAccess, resendInvite, sendReset, setActive } from "@/lib/hub/user-actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ActionForm } from "@/components/hub/ActionForm";
import { LocalTime } from "@/components/hub/LocalTime";
import { AccessGrid } from "./AccessGrid";
import { CopyFrom } from "./CopyFrom";

export const metadata = { title: "Manage access · BLEUSKM Studio OS" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  const id = assertUuid((await params).id);
  const people = await listPeople();
  const person = people.find((p) => p.id === id);
  if (!person || person.is_owner) notFound();

  const { supabase } = await loadSession();
  const [{ data: grants }, { data: productions }, { data: sections }] = await Promise.all([
    supabase.from("access_grants").select("id, production_id, section_key, level").eq("user_id", id),
    supabase.from("productions").select("id, title, status").order("title"),
    supabase.from("production_sections").select("production_id, section_key, enabled").eq("enabled", false),
  ]);
  const initial: Record<string, "view" | "edit"> = {};
  for (const g of (grants ?? []) as Grant[]) initial[cellName(g.production_id, g.section_key)] = g.level;
  const rows = [
    { scope: null, title: "Studio level", note: "Studio-wide records", disabled: [] as string[] },
    ...(productions ?? []).map((p) => ({
      scope: p.id as string,
      title: p.title as string,
      note: p.status === "archived" ? STATUS_LABEL[p.status as ProductionStatus] : undefined,
      disabled: (sections ?? []).filter((s) => s.production_id === p.id).map((s) => s.section_key as string),
    })),
  ];
  const cols = [...PRODUCTION_SECTIONS, ...STUDIO_ONLY_SECTIONS].map((k) => ({ key: k, label: SECTION_LABEL[k] }));
  const others = people.filter((p) => !p.is_owner && p.id !== id).map((p) => ({ id: p.id, name: p.full_name }));
  const active = person.status === "active";

  return (
    <>
      <PageHead title={person.full_name} lead={<><Link className="link" href="/settings/users">User Access</Link> · {person.email}</>} />
      <section className="panel">
        <h2>Account</h2>
        <p className="small">
          {active ? (person.invitePending ? "Invitation pending: they haven't chosen a password yet." : "Active.") : "Deactivated: they can't open the hub. Their access is kept for if you reactivate them."}
          {" "}Last signed in: <LocalTime iso={person.lastSignIn} />
        </p>
        <div className="actions-row">
          {active ? (
            <ActionForm action={setActive} fields={{ user_id: id, active: "false" }} label="Deactivate" busy="Deactivating…" quiet confirm={`Deactivate ${person.full_name}? They'll be signed out of the hub straight away.`} />
          ) : (
            <ActionForm action={setActive} fields={{ user_id: id, active: "true" }} label="Reactivate" busy="Reactivating…" />
          )}
          {active && (person.invitePending
            ? <ActionForm action={resendInvite} fields={{ user_id: id }} label="Send invitation again" busy="Sending…" quiet />
            : <ActionForm action={sendReset} fields={{ user_id: id }} label="Send password reset" busy="Sending…" quiet />)}
        </div>
      </section>
      <section className="panel">
        <h2>Access</h2>
        <p className="small">
          Choose what {person.full_name} can open. Studio level covers studio-wide records in the main areas ({MAIN_AREAS.map((k) => SECTION_LABEL[k]).join(", ")}).
          Each production row covers that production only. Edit includes View. Studio Overview and Productions show only the productions they have access to.
        </p>
        <AccessGrid userId={id} rows={rows} cols={cols} studioCols={[...MAIN_AREAS]} studioOnly={[...STUDIO_ONLY_SECTIONS]} initial={initial} />
      </section>
      {others.length > 0 && (
        <section className="panel">
          <h2>Copy access from another person</h2>
          <p className="small">Replaces {person.full_name}'s access with an exact copy of the other person's.</p>
          <CopyFrom action={copyAccess} userId={id} people={others} />
        </section>
      )}
    </>
  );
}
