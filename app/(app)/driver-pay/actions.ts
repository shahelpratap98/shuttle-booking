"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice } from "@/lib/auth";
import { fmtDate, isIsoDate } from "@/lib/dates";

const ids = (fd: FormData) => String(fd.get("job_ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));

// Pay a driver for these jobs: their pay, less any cash they collected, is
// settled on the day given. Undo puts them back on the list.
export async function settleDriver(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const list = ids(fd);
  if (!list.length) return { ok: false, message: "Nothing to mark." };
  const undo = fd.get("undo") === "1";
  const on = String(fd.get("on") ?? "");
  if (!undo && !isIsoDate(on)) return { ok: false, message: "Pick the day you paid them." };
  const res = await store.settleDriverPay(list, undo ? null : on);
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/driver-pay");
  revalidatePath("/", "layout");
  return { ok: true, message: undo ? "Put back as not paid." : `Marked ${list.length} job${list.length === 1 ? "" : "s"} as paid out on ${fmtDate(on)}.` };
}
