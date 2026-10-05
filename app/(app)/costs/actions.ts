"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice } from "@/lib/auth";
import { addMonths, fmtMonth } from "@/lib/dates";

const refresh = () => {
  revalidatePath("/costs");
  revalidatePath("/totals");
};

export async function addOverhead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const month = String(fd.get("month") ?? "");
  const category = String(fd.get("category") ?? "").trim().slice(0, 60);
  const amount = Number(String(fd.get("amount") ?? "").replace(/[$,\s]/g, ""));
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, message: "Pick the month." };
  if (!category) return { ok: false, message: "Say what the cost is, e.g. Google ads." };
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return { ok: false, message: "Enter the amount." };
  const res = await store.saveOverhead(null, { month, category, amount: Math.round(amount * 100) / 100, note: String(fd.get("note") ?? "").trim().slice(0, 300) || null });
  if (!res.ok) return { ok: false, message: res.error };
  refresh();
  return { ok: true, message: `${category} added.` };
}

export async function removeOverhead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const res = await store.deleteOverhead(String(fd.get("id") ?? ""));
  if (!res.ok) return { ok: false, message: res.error };
  refresh();
  return { ok: true, message: "Removed." };
}

// Most running costs repeat: start a month with last month's list.
export async function copyLastMonth(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const month = String(fd.get("month") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, message: "Pick the month." };
  const prev = addMonths(month, -1);
  const [last, now] = await Promise.all([store.overheads(prev, prev), store.overheads(month, month)]);
  if (!last.length) return { ok: false, message: `There's nothing in ${fmtMonth(prev)} to copy.` };
  const have = new Set(now.map((o) => o.category.toLowerCase()));
  let added = 0;
  for (const o of last) {
    if (have.has(o.category.toLowerCase())) continue;
    const res = await store.saveOverhead(null, { month, category: o.category, amount: o.amount, note: o.note });
    if (!res.ok) return { ok: false, message: res.error };
    added++;
  }
  refresh();
  return { ok: true, message: added ? `Copied ${added} cost${added === 1 ? "" : "s"} from ${fmtMonth(prev)}. Change any that are different.` : "This month already has all of last month's costs." };
}
