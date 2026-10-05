"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireOffice, requireViewer } from "@/lib/auth";
import { addDays, eachDay, fmtDate, isIsoDate, weekdayIndex } from "@/lib/dates";
import { parseJobForm } from "@/lib/job-form";
import type { Job, JobInput, JobStatus, PaymentMethod } from "@/lib/types";

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

// The office's "look at this" marker (the sheet's yellow and red rows).
export async function flagJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "job_id");
  const clear = fd.get("clear") === "1";
  const note = text(fd, "flag_note").slice(0, 300);
  if (!clear && !note) return { ok: false, message: "Say what needs looking at." };
  const res = await store.setFlag(id, clear ? null : note);
  if (!res.ok) return { ok: false, message: res.error };
  refreshJobs(id);
  return { ok: true, message: clear ? "Flag cleared." : "Flagged." };
}

// "Repeat this booking": the same trip on the chosen weekdays until a date
// (a contract run, a school run). The copies are new bookings in one series.
export async function repeatJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "job_id");
  const until = text(fd, "until");
  const days = fd.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const job = await store.job(id);
  if (!job) return { ok: false, message: "That job couldn't be found." };
  if (!isIsoDate(until) || until <= job.pickup_date) return { ok: false, message: "Pick an end date after this trip." };
  if (until > addDays(job.pickup_date, 366)) return { ok: false, message: "Repeat for up to a year at a time." };
  if (!days.length) return { ok: false, message: "Tick at least one day of the week." };

  const dates = eachDay(addDays(job.pickup_date, 1), until).filter((d) => days.includes(weekdayIndex(d)));
  if (dates.length > 250) return { ok: false, message: `That's ${dates.length} trips; repeat for a shorter stretch (250 at most).` };
  const seriesId = job.series_id ?? crypto.randomUUID();
  const already = new Set((await store.jobs({ seriesId, from: dates[0], to: until })).map((j) => j.pickup_date));

  const money = job.money ? { ...job.money, paid_on: null, payment_method: null, amount_paid: 0, invoice_no: null, ...(job.money.payment_status === "paid" ? { payment_status: "unpaid" as const } : {}) } : null;
  if (!job.series_id) {
    const res = await store.saveJob(job.id, { ...inputOf(job), series_id: seriesId }, job.money ?? null);
    if (!res.ok) return { ok: false, message: res.error };
  }
  let made = 0;
  for (const d of dates) {
    if (already.has(d)) continue;
    const res = await store.saveJob(null, { ...inputOf(job), pickup_date: d, status: "confirmed", linked_job_id: null, booking_ref: null, series_id: seriesId, flag_note: null }, money);
    if (!res.ok) return { ok: false, message: `Made ${made} trips, then: ${res.error}` };
    made++;
  }
  refreshJobs(id);
  return { ok: true, message: made ? `Added ${made} trip${made === 1 ? "" : "s"} up to ${fmtDate(until)}.` : "Those trips are already booked." };
}

// A saved job as form input, for copying it.
function inputOf(j: Job): JobInput {
  return {
    booking_ref: j.booking_ref, status: j.status, service_type: j.service_type, pickup_date: j.pickup_date, pickup_time: j.pickup_time,
    duration_min: j.duration_min, pickup_address: j.pickup_address, dropoff_address: j.dropoff_address, passengers: j.passengers,
    luggage: j.luggage, flight_no: j.flight_no, customer_name: j.customer_name, customer_phone: j.customer_phone,
    customer_email: j.customer_email, booking_source: j.booking_source, driver_id: j.driver_id, vehicle_id: j.vehicle_id,
    linked_job_id: j.linked_job_id, is_shared: j.is_shared, driver_pay: j.driver_pay, notes: j.notes, distance_km: null,
    operator: j.operator, children: j.children, infants: j.infants,
  };
}
