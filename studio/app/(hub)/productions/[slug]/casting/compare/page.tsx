import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { APP_COLS, MATERIAL_COLS, castingAccess, callsAndRoles, materialKey, signMaterials, type Application, type Material } from "@/lib/hub/casting-data";
import { APP_STATUS_LABEL, MATERIAL_LABEL } from "@/lib/hub/casting-core";
import { isUuid } from "@/lib/sections";

// Up to six applicants side by side: headshot, self-tape, answers, rating.
export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ids?: string | string[] }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { p, canView } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canView) return <NoAccess what={`Casting on ${p.title}`} />;
  const base = `/productions/${p.slug}/casting`;
  const ids = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).filter(isUuid).slice(0, 6);
  if (ids.length < 2) {
    return (<><PageHead title="Compare applicants" lead={<Link className="link" href={base}>{p.title} · Casting</Link>} /><p>Tick two to six applicants on the Casting page, then choose Compare.</p></>);
  }
  const { supabase } = await loadSession();
  const [{ roles }, { data: appRows }, { data: matRows }, { data: noteRows }] = await Promise.all([
    callsAndRoles(p.id),
    supabase.from("casting_applications").select(APP_COLS).in("id", ids).eq("production_id", p.id),
    supabase.from("casting_materials").select(MATERIAL_COLS).in("application_id", ids),
    supabase.from("casting_notes").select("application_id").in("application_id", ids),
  ]);
  const apps = ids.map((id) => ((appRows ?? []) as Application[]).find((a) => a.id === id)).filter((a): a is Application => !!a);
  const mats = (matRows ?? []) as Material[];
  const signed = await signMaterials(mats);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const notes = new Map<string, number>();
  for (const n of noteRows ?? []) notes.set(n.application_id as string, (notes.get(n.application_id as string) ?? 0) + 1);

  return (
    <>
      <PageHead title="Compare applicants" lead={<Link className="link" href={base}>{p.title} · Casting</Link>} />
      <div className="cards" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
        {apps.map((a) => {
          const mine = mats.filter((m) => m.application_id === a.id);
          const head = mine.find((m) => m.kind === "headshot" && m.storage_path && (m.mime_type ?? "").startsWith("image/"));
          const tape = mine.filter((m) => m.kind === "self_tape").at(-1);
          const tapeUrl = tape ? (tape.storage_path ? signed.get(materialKey(tape)) : tape.url) : null;
          return (
            <section key={a.id} className="panel">
              {head && signed.get(materialKey(head)) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.get(materialKey(head))} alt={`Headshot of ${a.full_name}`} style={{ width: "100%", height: 260, objectFit: "cover", background: "#0b0b0b" }} />
              )}
              <h2 style={{ marginTop: 10 }}><Link className="link" href={`${base}/applicants/${a.id}`}>{a.full_name}</Link></h2>
              <p><span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span> {a.rating ? "★".repeat(a.rating) : <span className="small">not rated</span>}</p>
              <dl className="facts">
                <dt>Role</dt><dd>{roleName.get(a.role_id) ?? ""}</dd>
                {a.age !== null && <><dt>Age</dt><dd>{a.age}</dd></>}
                {a.location && <><dt>Location</dt><dd>{a.location}</dd></>}
                {a.availability && <><dt>Availability</dt><dd>{a.availability}</dd></>}
                <dt>Materials</dt><dd>{mine.map((m) => MATERIAL_LABEL[m.kind]).join(", ") || "None"}</dd>
                <dt>Notes</dt><dd>{notes.get(a.id) ?? 0}</dd>
              </dl>
              {tape && tapeUrl && (tape.storage_path && (tape.mime_type ?? "").startsWith("video/")
                ? <video controls preload="metadata" src={tapeUrl} style={{ width: "100%", background: "#000" }} />
                : <p><a className="link" href={tapeUrl} target="_blank" rel="noopener noreferrer">Watch self-tape</a></p>)}
              {a.about && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{a.about.slice(0, 600)}{a.about.length > 600 ? "…" : ""}</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
