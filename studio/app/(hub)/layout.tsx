import { hubContext } from "@/lib/hub/data";
import { menuFor } from "@/lib/hub/access";
import { SECTION_LABEL } from "@/lib/hub/labels";
import { SideNav } from "@/components/hub/SideNav";
import { ProductionSwitcher } from "@/components/hub/ProductionSwitcher";

export const dynamic = "force-dynamic";

// Every hub page sits inside this layout. It signs the person in (or sends them
// to the right step) before anything renders. Each page checks access again.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { me, grants, productions } = await hubContext();
  const menu = menuFor(me.isOwner, grants).map((m) => ({ ...m, label: SECTION_LABEL[m.key] }));
  const switchable = productions.filter((p) => p.status !== "archived").map((p) => ({ slug: p.slug, title: p.title }));
  return (
    <div className="hub">
      <aside className="hub-side">
        <a className="hub-brand" href="/">
          <span className="eyebrow">BLEUSKM</span>
          <span className="hub-brand-name">Studio OS</span>
        </a>
        <ProductionSwitcher productions={switchable} />
        <SideNav items={menu} />
        <div className="hub-me">
          <p className="hub-me-name">{me.fullName}</p>
          <p className="small">{me.isOwner ? "Studio owner" : me.email}</p>
          <form action="/auth/signout" method="post">
            <button className="link-button" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="hub-main">{children}</main>
    </div>
  );
}
