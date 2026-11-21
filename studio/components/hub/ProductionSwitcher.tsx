"use client";

import { usePathname, useRouter } from "next/navigation";

export function ProductionSwitcher({ productions }: { productions: { slug: string; title: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const current = /^\/productions\/([^/]+)/.exec(path)?.[1] ?? "";
  if (productions.length === 0) return null;
  return (
    <label className="hub-switcher">
      <span className="small">Production</span>
      <select value={productions.some((p) => p.slug === current) ? current : ""} onChange={(e) => e.target.value && router.push(`/productions/${e.target.value}`)}>
        <option value="">Choose a production…</option>
        {productions.map((p) => (
          <option key={p.slug} value={p.slug}>{p.title}</option>
        ))}
      </select>
    </label>
  );
}
