import "server-only";
import { addDays, todayIn } from "@/lib/dates";
import type { Store } from "@/lib/store";

// Pick-lists for the job form: people, vehicles, past customers and places.
export async function jobFormLists(store: Store) {
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const [people, vehicles, customers, recent] = await Promise.all([
    store.people(),
    store.vehicles(),
    store.recentCustomers(),
    store.jobs({ from: addDays(today, -120), order: "desc", limit: 1500 }),
  ]);
  // Most-used addresses first.
  const counts = new Map<string, number>();
  for (const j of recent) for (const a of [j.pickup_address, j.dropoff_address]) counts.set(a, (counts.get(a) ?? 0) + 1);
  const places = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([a]) => a);
  return { settings, today, people, vehicles, customers, places };
}
