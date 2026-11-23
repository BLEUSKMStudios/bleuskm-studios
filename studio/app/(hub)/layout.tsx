import Link from "next/link";
import { hubContext } from "@/lib/hub/data";
import { navFor } from "@/lib/hub/nav";
import { writeBlockReason } from "@/lib/hub/env";
import { SideNav } from "@/components/hub/SideNav";
import { Shell } from "@/components/hub/Shell";
import { ProductionSwitcher } from "@/components/hub/ProductionSwitcher";

export const dynamic = "force-dynamic";

// Every hub page sits inside this layout. It signs the person in (or sends them
// to the right step) before anything renders. Each page checks access again.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { me, grants, productions } = await hubContext();
  const groups = navFor(me.isOwner, grants);
  const switchable = productions.filter((p) => p.status !== "archived").map((p) => ({ slug: p.slug, title: p.title }));
  const readOnly = writeBlockReason();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Shell
        top={
          <>
            <Link className="top-brand" href="/"><span className="eyebrow">BLEUSKM</span> <span>Studio OS</span></Link>
            <div className="top-switch"><ProductionSwitcher productions={switchable} /></div>
          </>
        }
        side={
          <>
            <Link className="hub-brand" href="/">
              <span className="eyebrow">BLEUSKM</span>
              <span className="hub-brand-name">Studio OS</span>
            </Link>
            <SideNav groups={groups} />
            <div className="hub-me">
              <p className="hub-me-name">{me.fullName}</p>
              <p className="small">{me.isOwner ? "Studio owner" : me.email}</p>
              <form action="/auth/signout" method="post">
                <button className="link-button" type="submit">Sign out</button>
              </form>
            </div>
          </>
        }
      >
        {readOnly && <p className="banner" role="status">{readOnly}</p>}
        {children}
      </Shell>
    </>
  );
}
