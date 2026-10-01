import "server-only";
import { BILLABLE } from "@/lib/constants";
import { addDays, startOfWeek, todayIn } from "@/lib/dates";
import { charge } from "@/lib/format";
import type { Store } from "@/lib/store";

// What's booked so far in each month ("m:2026-12") and week ("w:2026-12-07",
// the Monday): number of bookings and total booking $.
export type BookedSoFar = Record<string, { bookings: number; total: number }>;

// Pick-lists for the job form: people, vehicles, past customers and places,
// plus the month and week totals the form shows as a booking is entered.
export async function jobFormLists(store: Store) {
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const [people, vehicles, customers, recent, booked, weeklyTarget] = await Promise.all([
    store.people(),
    store.vehicles(),
    store.recentCustomers(),
    store.jobs({ from: addDays(today, -120), order: "desc", limit: 1500 }),
    store.jobs({ from: addDays(today, -400), statuses: BILLABLE }),
    store.weeklyTarget(),
  ]);
  // Most-used addresses first.
  const counts = new Map<string, number>();
  for (const j of recent) for (const a of [j.pickup_address, j.dropoff_address]) counts.set(a, (counts.get(a) ?? 0) + 1);
  const places = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([a]) => a);

  const totals: BookedSoFar = {};
  for (const j of booked) {
    for (const key of [`m:${j.pickup_date.slice(0, 7)}`, `w:${startOfWeek(j.pickup_date)}`]) {
      const t = (totals[key] ??= { bookings: 0, total: 0 });
      t.bookings++;
      t.total += charge(j);
    }
  }
  return { settings, today, people, vehicles, customers, places, totals, weeklyTarget };
}
