"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireOffice, requireViewer } from "@/lib/auth";
import { parseJobForm } from "@/lib/job-form";
import type { JobStatus, PaymentMethod } from "@/lib/types";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function refreshJobs(id?: string) {
  revalidatePath("/", "layout"); // nav badge, dashboard, calendar, lists
  if (id) revalidatePath(`/jobs/${id}`);
}

export async function saveJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "id") || null;
  const parsed = parseJobForm(fd);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  const res = await store.saveJob(id, parsed.input, parsed.money);
  if (!res.ok) return { ok: false, message: res.error };
  refreshJobs(res.data);
  redirect(`/jobs/${res.data}?saved=${id ? "updated" : "created"}`);
}

// Quick assign from the jobs list, the calendar or the job page.
export async function assignJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "job_id");
  const res = await store.assignJob(id, text(fd, "driver_id") || null, text(fd, "vehicle_id") || null);
  if (!res.ok) return { ok: false, message: res.error };
  refreshJobs(id);
  return { ok: true, message: text(fd, "driver_id") ? "Assigned." : "Driver removed." };
}

export async function setStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "job_id");
  const status = text(fd, "status") as JobStatus;
  if (!["enquiry", "confirmed", "completed", "cancelled", "no_show"].includes(status)) return { ok: false, message: "Pick a status." };
  const res = await store.setJobStatus(id, status);
  if (!res.ok) return { ok: false, message: res.error };
  refreshJobs(id);
  return { ok: true, message: "Status updated." };
}

export async function deleteJob(fd: FormData) {
  const { store } = await requireOffice();
  const id = text(fd, "job_id");
  const res = await store.deleteJob(id);
  if (!res.ok) redirect(`/jobs/${id}?error=${encodeURIComponent(res.error)}`);
  refreshJobs();
  redirect("/jobs?deleted=1");
}

// Drivers: mark their own job done / no-show, with notes and distance.
export async function driverUpdate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireViewer();
  const id = text(fd, "job_id");
  const status = text(fd, "status") as JobStatus;
  const kmRaw = text(fd, "distance_km");
  const km = kmRaw === "" ? null : Number(kmRaw);
  if (km !== null && (!Number.isFinite(km) || km < 0 || km > 5000)) return { ok: false, message: "Distance must be between 0 and 5000 km." };

  // Only works for the job's own driver (checked by the database).
  const via = text(fd, "collected_via");
  if (via && !["cash", "card", "online", "bank"].includes(via)) return { ok: false, message: "Say how they paid." };
  const res = await store.driverUpdateJob(id, status, text(fd, "driver_notes").slice(0, 1000) || null, km, (via || null) as PaymentMethod | null);
  if (!res.ok) return { ok: false, message: res.error };
  refreshJobs(id);
  const paidNote = via ? ` Payment recorded (${via}).` : "";
  return { ok: true, message: (status === "completed" ? "Marked as done. Thanks!" : status === "no_show" ? "Marked as a no-show." : "Saved.") + paidNote };
}
