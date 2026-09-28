import { minutesOf, fmtTime, timeFromMinutes } from "@/lib/dates";
import { jobRef } from "@/lib/format";
import type { Job, Profile, TimeOff, Vehicle } from "@/lib/types";

// A driver needs a little time between jobs to get to the next pickup.
export const TURNAROUND_MIN = 15;

type Slot = Pick<Job, "id" | "pickup_date" | "pickup_time" | "duration_min" | "driver_id" | "vehicle_id" | "status" | "is_shared">;

export const live = (j: Slot) => j.status === "confirmed" || j.status === "enquiry" || j.status === "completed";

// Two jobs that tie up the same driver or vehicle at once. Shared jobs are
// meant to run together, so two shared jobs never clash with each other.
export function overlaps(a: Slot, b: Slot): boolean {
  if (a.pickup_date !== b.pickup_date) return false;
  if (a.is_shared && b.is_shared) return false;
  const a0 = minutesOf(a.pickup_time);
  const b0 = minutesOf(b.pickup_time);
  return a0 < b0 + b.duration_min + TURNAROUND_MIN && b0 < a0 + a.duration_min + TURNAROUND_MIN;
}

const timeWindow = (j: Slot) => `${fmtTime(j.pickup_time)}–${fmtTime(timeFromMinutes(minutesOf(j.pickup_time) + j.duration_min))}`;

// Why this driver can't (or shouldn't) do this job, if anything.
export function driverConflict(job: Slot, driverId: string, sameDay: Job[], timeOff: TimeOff[]): string | null {
  const off = timeOff.find((t) => t.user_id === driverId && t.starts_on <= job.pickup_date && t.ends_on >= job.pickup_date);
  if (off) return `off${off.note ? ` (${off.note})` : ""}`;
  const clash = sameDay.find((o) => o.id !== job.id && o.driver_id === driverId && live(o) && overlaps(job, o));
  if (clash) return `on ${jobRef(clash.job_no)} ${timeWindow(clash)}`;
  return null;
}

// Plain-language warnings for a job's current driver and vehicle.
export function jobWarnings(job: Job, sameDay: Job[], timeOff: TimeOff[], people: Profile[], vehicles: Vehicle[]): string[] {
  if (!live(job)) return [];
  const out: string[] = [];
  if (job.driver_id) {
    const name = people.find((p) => p.user_id === job.driver_id)?.display_name ?? "The driver";
    const c = driverConflict(job, job.driver_id, sameDay, timeOff);
    if (c?.startsWith("off")) out.push(`${name} has time off that day${c.slice(3)}.`);
    else if (c) out.push(`${name} is also ${c}, which overlaps this job (allowing ${TURNAROUND_MIN} min between jobs).`);
    const p = people.find((x) => x.user_id === job.driver_id);
    if (p && !p.is_active) out.push(`${name} is no longer active.`);
  }
  if (job.vehicle_id) {
    const v = vehicles.find((x) => x.id === job.vehicle_id);
    const clash = sameDay.find((o) => o.id !== job.id && o.vehicle_id === job.vehicle_id && live(o) && overlaps(job, o));
    if (v && clash) out.push(`${v.name} is also booked for ${jobRef(clash.job_no)} ${timeWindow(clash)}.`);
    if (v?.seats && job.passengers > v.seats) out.push(`${v.name} has ${v.seats} seats but this job has ${job.passengers} passengers.`);
  }
  return out;
}
