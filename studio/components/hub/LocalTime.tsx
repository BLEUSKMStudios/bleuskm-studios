"use client";

/** Shows a time in the viewer's own time zone. */
export function LocalTime({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <>—</>;
  const d = new Date(iso);
  return <time dateTime={iso} suppressHydrationWarning>{d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
