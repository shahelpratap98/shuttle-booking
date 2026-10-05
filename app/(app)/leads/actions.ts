"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice } from "@/lib/auth";
import { fmtDate, isIsoDate } from "@/lib/dates";

const count = (fd: FormData, name: string) => {
  const raw = String(fd.get(name) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : NaN;
};

// How many enquiries came in on a day (website, calls, messages…).
export async function saveLeadDay(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const day = String(fd.get("day") ?? "");
  const leads = count(fd, "leads");
  const local = count(fd, "local");
  if (!isIsoDate(day)) return { ok: false, message: "Pick the day." };
  if (leads === null || Number.isNaN(leads)) return { ok: false, message: "Enter how many enquiries came in (a whole number)." };
  if (Number.isNaN(local) || (local !== null && local > leads)) return { ok: false, message: "Local can't be more than the total." };
  const res = await store.saveLeads({ day, leads, local, note: String(fd.get("note") ?? "").trim().slice(0, 300) || null });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/leads");
  revalidatePath("/totals");
  return { ok: true, message: `Saved ${leads} for ${fmtDate(day)}.` };
}
