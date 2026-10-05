import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import type { Vehicle } from "@/lib/types";

const DUES = [
  ["cof_due", "COF"],
  ["rego_due", "Rego"],
  ["service_due", "Service"],
] as const;

export interface VehicleAlert {
  vehicle: Vehicle;
  what: string; // "COF", "Rego", "Service"
  due: string;
  overdue: boolean;
  text: string; // "Van: COF due 12 Nov 2026 (in 5 days)"
}

// COF, rego and service dates that have passed or fall in the next `days`.
export function vehicleAlerts(vehicles: Vehicle[], today: string, days = 30): VehicleAlert[] {
  const out: VehicleAlert[] = [];
  for (const v of vehicles) {
    if (!v.is_active) continue;
    for (const [field, what] of DUES) {
      const due = v[field];
      if (!due || due > addDays(today, days)) continue;
      const n = daysBetween(today, due);
      const when = n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`;
      out.push({ vehicle: v, what, due, overdue: n < 0, text: `${v.name}: ${what} due ${fmtDate(due)} (${when})` });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
