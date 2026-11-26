"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { groupForPath, NAV_ALIASES, type NavGroup } from "@/lib/hub/nav";

const KEY = "studio-os-nav";

function readSaved(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** The lifecycle menu: expandable groups, remembered per browser. */
export function SideNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const current = groupForPath(path);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => setOpen(readSaved()), []);
  const isOpen = (k: string) => open[k] ?? (k === current || k === "dashboard");
  const toggle = (k: string) => {
    const next = { ...open, [k]: !isOpen(k) };
    setOpen(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: not remembered */ }
  };
  const alias = Object.keys(NAV_ALIASES).find((a) => path === a || path.startsWith(`${a}/`));
  const here = alias ? NAV_ALIASES[alias] : path;
  const active = (href: string) => {
    if (href.includes("#")) return false;
    return href === "/" ? here === "/" : here === href || here.startsWith(`${href}/`);
  };
  return (
    <nav className="hub-nav" aria-label="Main">
      {groups.map((g) => {
        const expanded = isOpen(g.key);
        return (
          <div key={g.key} className={`nav-group${g.key === current ? " has-current" : ""}`}>
            <button type="button" className="nav-group-head" aria-expanded={expanded} aria-controls={`nav-${g.key}`} onClick={() => toggle(g.key)}>
              <span>{g.label}</span>
              <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <ul id={`nav-${g.key}`} hidden={!expanded}>
              {g.items.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className={active(i.href) ? "active" : undefined} aria-current={active(i.href) ? "page" : undefined}>{i.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
