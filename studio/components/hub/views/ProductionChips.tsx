import Link from "next/link";
import type { Production } from "@/lib/hub/data";

/** "All / one production" filter chips that keep the rest of the address. */
export function ProductionChips({ productions, current, href }: { productions: readonly Production[]; current?: string; href: (production?: string) => string }) {
  const live = productions.filter((p) => p.status !== "archived");
  if (live.length < 2) return null;
  return (
    <nav className="filters" aria-label="Filter by production">
      <Link className={`chip${!current ? " on" : ""}`} href={href()}>All</Link>
      {live.map((p) => <Link key={p.id} className={`chip${current === p.id ? " on" : ""}`} href={href(p.id)}>{p.title}</Link>)}
    </nav>
  );
}

/** Adds query values to an address that may already have some. */
export function withQuery(base: string, q: Record<string, string | undefined>): string {
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(q)) { if (v) params.set(k, v); else params.delete(k); }
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}
