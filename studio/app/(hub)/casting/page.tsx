import { workspaceByKey } from "@/lib/hub/workspaces";
import { WorkspaceView, type WorkspaceSearch } from "@/components/hub/WorkspaceView";

export const metadata = { title: "Casting · BLEUSKM Studio OS" };

// Casting management (roles, auditions, evaluations, cast roster, emails).
// Applications from the website arrive in /applications.
export default async function CastingWorkspace({ searchParams }: { searchParams: Promise<WorkspaceSearch> }) {
  return <WorkspaceView ws={workspaceByKey("casting")!} search={await searchParams} />;
}
