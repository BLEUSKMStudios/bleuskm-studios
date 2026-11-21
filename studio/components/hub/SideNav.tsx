"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav({ items }: { items: { key: string; href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="hub-nav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={active(i.href) ? "active" : undefined} aria-current={active(i.href) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
