import type { Customer } from "@/lib/store/types";
import type { Job } from "@/lib/types";

// Who a customer is, for "have they booked with us before?". The same rule as
// the jobs.customer_key column in supabase/migrations/20260930000100_totals_repeat.sql:
// the phone number's digits without +64 or the leading 0 (so 021 620 533 and
// +64 21 620533 match), or the name when there's no usable phone.
export function customerKey(name: string, phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/[^0-9]/g, "").replace(/^(00)?64/, "").replace(/^0+/, "");
  return digits.length >= 6 ? `p:${digits}` : `n:${name.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

type Visit = Pick<Job, "id" | "customer_name" | "customer_phone" | "status" | "pickup_date" | "pickup_time" | "job_no" | "linked_job_id">;

// How many bookings this customer made before this one: same counting as
// public.repeat_counts. A there-and-back trip is one booking; enquiries and
// cancellations don't count.
export function earlierBookings(j: Visit, all: Visit[]): number {
  const key = customerKey(j.customer_name, j.customer_phone);
  const bookings = new Set<string>();
  for (const o of all) {
    if (o.id === j.id || o.id === j.linked_job_id || o.status === "cancelled" || o.status === "enquiry") continue;
    if (customerKey(o.customer_name, o.customer_phone) !== key) continue;
    const before =
      o.pickup_date < j.pickup_date ||
      (o.pickup_date === j.pickup_date && (o.pickup_time < j.pickup_time || (o.pickup_time === j.pickup_time && o.job_no < j.job_no)));
    if (before) bookings.add(o.linked_job_id && o.linked_job_id < o.id ? o.linked_job_id : o.id);
  }
  return bookings.size;
}

// Past customers for the booking form: one entry per customer (newest details
// first), with how many trips they've booked and when the latest is.
// `rows` must be newest-created first.
export function customersFrom(
  rows: Pick<Job, "id" | "customer_name" | "customer_phone" | "customer_email" | "status" | "pickup_date" | "linked_job_id">[],
): Customer[] {
  const byKey = new Map<string, Customer & { trips: Set<string> }>();
  for (const r of rows) {
    const key = customerKey(r.customer_name, r.customer_phone);
    let c = byKey.get(key);
    if (!c) {
      c = { name: r.customer_name, phone: r.customer_phone, email: r.customer_email, key, bookings: 0, last: null, trips: new Set() };
      byKey.set(key, c);
    }
    if (!c.email && r.customer_email) c.email = r.customer_email;
    if (r.status === "cancelled" || r.status === "enquiry") continue;
    c.trips.add(r.linked_job_id && r.linked_job_id < r.id ? r.linked_job_id : r.id);
    if (!c.last || r.pickup_date > c.last) c.last = r.pickup_date;
  }
  return [...byKey.values()].map(({ trips, ...c }) => ({ ...c, bookings: trips.size }));
}

// 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd"
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// "Repeat customer · 3rd booking", from the number of earlier bookings.
export const repeatLabel = (earlier: number) => `Repeat customer · ${ordinal(earlier + 1)} booking`;
