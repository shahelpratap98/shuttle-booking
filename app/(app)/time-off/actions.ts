"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { isOffice, requireViewer } from "@/lib/auth";
import { daysBetween, isIsoDate } from "@/lib/dates";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

export async function addTimeOff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { viewer, store } = await requireViewer();
  const userId = isOffice(viewer.role) ? text(fd, "user_id") || viewer.user_id : viewer.user_id;
  const startsOn = text(fd, "starts_on");
  const endsOn = text(fd, "ends_on") || startsOn;
  if (!isIsoDate(startsOn)) return { ok: false, message: "Pick the first day off." };
  if (!isIsoDate(endsOn) || endsOn < startsOn) return { ok: false, message: "The last day must be on or after the first day." };
  if (daysBetween(startsOn, endsOn) > 366) return { ok: false, message: "Keep it to a year or less." };

  const res = await store.addTimeOff({ user_id: userId, starts_on: startsOn, ends_on: endsOn, note: text(fd, "note").slice(0, 200) || null });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: "Time off added. It shows on the calendar, and the driver is flagged as off when jobs are assigned." };
}

export async function removeTimeOff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireViewer();
  const res = await store.deleteTimeOff(text(fd, "id"));
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: "Removed." };
}
