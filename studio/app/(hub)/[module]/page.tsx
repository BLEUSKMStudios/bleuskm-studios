import { notFound, redirect } from "next/navigation";
import { moduleByKey } from "@/lib/hub/modules";
import { workspaceByKey, workspaceHrefForModule } from "@/lib/hub/workspaces";
import { ModuleView } from "@/components/hub/ModuleView";
import { WorkspaceView, type WorkspaceSearch } from "@/components/hub/WorkspaceView";

// Studio-wide pages. A workspace (/scheduling, /crew, /post, /distribution)
// shows its tabs; a module that now lives in a workspace tab (/call-sheets,
// /editing …) opens that tab; any other module (/scripts, /contacts …) its list.
export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<WorkspaceSearch> }) {
  const [{ module }, search] = await Promise.all([params, searchParams]);
  const ws = workspaceByKey(module);
  if (ws) return <WorkspaceView ws={ws} search={search} />;
  const moved = workspaceHrefForModule(module);
  if (moved) redirect(search.production ? `${moved}&production=${encodeURIComponent(search.production)}` : moved);
  const def = moduleByKey(module);
  if (!def || def.hidden) notFound();
  return <ModuleView def={def} filter={search.production} />;
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const title = workspaceByKey(module)?.title ?? moduleByKey(module)?.title ?? "Studio OS";
  return { title: `${title} · BLEUSKM Studio OS` };
}
