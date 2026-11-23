import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { CALL_STATUS_LABEL, formatStudioTime, type CallStatus } from "@/lib/hub/casting-core";

// Studio-level Casting: every production's casting at a glance, limited to what
// this person may see (Row Level Security filters the rows).
export default async function CastingArea() {
  const { me, grants, productions } = await hubContext();
  const studio = await dbCheck(null, "casting", "view");
  const mine = grants.filter((g) => g.section_key === "casting");
  if (!me.isOwner && !studio && mine.length === 0) return <NoAccess what="Casting" />;
  const { supabase } = await loadSession();
  const [{ data: calls }, { data: apps }] = await Promise.all([
    supabase.from("casting_calls").select("id, production_id, title, status, deadline").order("created_at"),
    supabase.from("casting_applications").select("production_id, status").limit(10000),
  ]);
  const visible = productions.filter((p) => me.isOwner || mine.some((g) => g.production_id === p.id));
  return (
    <>
      <PageHead title="Casting" lead="Casting calls and applicants for each production" />
      {visible.length === 0 && <p className="small">No productions are open to you here.</p>}
      <div className="cards">
        {visible.map((p) => {
          const pc = (calls ?? []).filter((c) => c.production_id === p.id);
          const pa = (apps ?? []).filter((a) => a.production_id === p.id);
          const fresh = pa.filter((a) => a.status === "submitted").length;
          return (
            <Link key={p.id} className="card" href={`/productions/${p.slug}/casting`}>
              <h2>{p.title}</h2>
              <p className="small">{pc.length === 0 ? "No casting calls yet" : pc.map((c) => `${c.title}: ${CALL_STATUS_LABEL[c.status as CallStatus]}${c.deadline ? `, closes ${formatStudioTime(c.deadline as string)}` : ""}`).join(" · ")}</p>
              <p style={{ marginTop: 8 }}>{pa.length} applicant{pa.length === 1 ? "" : "s"}{fresh ? ` · ${fresh} new` : ""}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
