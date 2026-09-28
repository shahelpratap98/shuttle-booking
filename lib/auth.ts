import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getStore, type Store } from "@/lib/store";
import type { Profile, Role } from "@/lib/types";

export const isOffice = (role: Role) => role === "owner" || role === "dispatcher";
export const isOwner = (role: Role) => role === "owner";

// Where each role lands after signing in.
export const homeFor = (role: Role) => (isOffice(role) ? "/dashboard" : "/my-jobs");

// The signed-in person and a store bound to them, or a redirect to /login.
// Cached per request.
export const requireViewer = cache(async (): Promise<{ viewer: Profile; store: Store }> => {
  const store = await getStore();
  const viewer = await store.viewer();
  // proxy.ts has already sent signed-out visitors to /login, so reaching here
  // means a session with no matching person. The notice stops proxy.ts
  // bouncing them straight back.
  if (!viewer) redirect("/login?error=noprofile");
  // Deactivated people keep their login (history stays intact) but the
  // database hides everything from them.
  if (!viewer.is_active) redirect("/login?error=inactive");
  return { viewer, store };
});

export async function requireOffice() {
  const ctx = await requireViewer();
  if (!isOffice(ctx.viewer.role)) redirect(homeFor(ctx.viewer.role));
  return ctx;
}

export async function requireOwner() {
  const ctx = await requireViewer();
  if (!isOwner(ctx.viewer.role)) redirect(homeFor(ctx.viewer.role));
  return ctx;
}
