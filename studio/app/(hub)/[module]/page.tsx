import { notFound } from "next/navigation";
import { moduleByKey } from "@/lib/hub/modules";
import { ModuleView } from "@/components/hub/ModuleView";

// Studio-wide module pages: /scripts, /crew, /call-sheets, /festivals, /contacts …
export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<{ production?: string }> }) {
  const [{ module }, { production }] = await Promise.all([params, searchParams]);
  const def = moduleByKey(module);
  if (!def) notFound();
  return <ModuleView def={def} filter={production} />;
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const def = moduleByKey((await params).module);
  return { title: `${def?.title ?? "Studio OS"} · BLEUSKM Studio OS` };
}
