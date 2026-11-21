import "server-only";

import { hubContext } from "./data.ts";

/** True for the active owner. Settings pages show "No access" to everyone else. */
export async function isOwnerHere(): Promise<boolean> {
  const { me } = await hubContext();
  return me.isOwner;
}
