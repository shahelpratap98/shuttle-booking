import type { DriverOption, VehicleOption } from "@/app/(app)/jobs/job-controls";
import { driverConflict, live, overlaps } from "@/lib/clashes";
import type { Job, Profile, TimeOff, Vehicle } from "@/lib/types";

// Everyone who could drive this job, drivers first, each labelled if they're
// off or already on another job at that time.
export function driverOptions(job: Job, people: Profile[], sameDay: Job[], timeOff: TimeOff[]): DriverOption[] {
  return people
    .filter((p) => p.is_active)
    .sort((a, b) => Number(a.role !== "driver") - Number(b.role !== "driver") || a.display_name.localeCompare(b.display_name))
    .map((p) => ({ id: p.user_id, name: p.display_name, note: driverConflict(job, p.user_id, sameDay, timeOff) }));
}

export function vehicleOptions(job: Job, vehicles: Vehicle[], sameDay: Job[]): VehicleOption[] {
  return vehicles
    .filter((v) => v.is_active || v.id === job.vehicle_id)
    .map((v) => {
      const busy = sameDay.some((o) => o.id !== job.id && o.vehicle_id === v.id && live(o) && overlaps(job, o));
      const small = v.seats && job.passengers > v.seats ? `only ${v.seats} seats` : null;
      return { id: v.id, name: v.name, note: busy ? "in use then" : small };
    });
}
