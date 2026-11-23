"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The page frame. Desktop: the sidebar is open and can be collapsed.
 * Tablet and phone: the sidebar is a drawer opened from the top bar.
 */
export function Shell({ side, top, children }: { side: React.ReactNode; top: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem("studio-os-collapsed") === "1"); } catch { /* not remembered */ }
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem("studio-os-collapsed", next ? "1" : "0"); } catch { /* not remembered */ }
  };
  return (
    <div className={`hub${collapsed ? " is-collapsed" : ""}${drawer ? " drawer-open" : ""}`}>
      <header className="hub-top">
        <button type="button" className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={drawer} aria-controls="hub-side" onClick={() => setDrawer(true)}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="icon-btn collapse-btn" aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} aria-pressed={collapsed} onClick={toggleCollapse}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7.5 3.5v13" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        {top}
      </header>
      <div className="scrim" hidden={!drawer} onClick={() => setDrawer(false)} />
      <aside id="hub-side" className="hub-side" aria-label="Studio OS">
        <button type="button" className="icon-btn close-btn" aria-label="Close menu" onClick={() => setDrawer(false)}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        {side}
      </aside>
      <main id="main" className="hub-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
