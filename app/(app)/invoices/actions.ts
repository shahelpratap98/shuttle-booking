"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice } from "@/lib/auth";
import { fmtDate, isIsoDate } from "@/lib/dates";
import type { PaymentMethod } from "@/lib/types";

// An invoice (or an account's bookings) has been paid: mark them all paid.
export async function markInvoicePaid(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const ids = String(fd.get("job_ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const on = String(fd.get("on") ?? "");
  const method = String(fd.get("method") ?? "");
  if (!ids.length) return { ok: false, message: "Nothing to mark." };
  if (!isIsoDate(on)) return { ok: false, message: "Pick the day it was paid." };
  if (!["bank", "online", "cash", "card"].includes(method)) return { ok: false, message: "Say how it was paid." };
  const res = await store.markPaid(ids, on, method as PaymentMethod);
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/invoices");
  revalidatePath("/", "layout");
  return { ok: true, message: `${ids.length} booking${ids.length === 1 ? "" : "s"} marked paid on ${fmtDate(on)}.` };
}
