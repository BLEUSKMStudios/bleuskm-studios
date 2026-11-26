import { workspaceByKey } from "@/lib/hub/workspaces";
import { WorkspaceView, type WorkspaceSearch } from "@/components/hub/WorkspaceView";

export const metadata = { title: "Applications · BLEUSKM Studio OS" };

// Cast and crew applications, handled in one place.
export default async function Applications({ searchParams }: { searchParams: Promise<WorkspaceSearch> }) {
  return <WorkspaceView ws={workspaceByKey("applications")!} search={await searchParams} />;
}
