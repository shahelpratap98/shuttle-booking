import type { Job, JobMoney } from "@/lib/types";

export function money(n: number, currency = "NZD", opts: { cents?: boolean } = {}): string {
  const cents = opts.cents ?? true;
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    }).format(n);
  } catch {
    return (cents ? n.toFixed(2) : Math.round(n).toString());
  }
}

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-NZ", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const jobRef = (jobNo: number) => `J-${jobNo}`;

export function totalCost(m: JobMoney | null | undefined): number {
  if (!m) return 0;
  return m.driver_cost + m.fuel_cost + m.tolls_parking + m.other_cost;
}

export function profit(m: JobMoney | null | undefined): number {
  return (m?.price ?? 0) - totalCost(m);
}

export const route = (j: Pick<Job, "pickup_address" | "dropoff_address">) => `${j.pickup_address} → ${j.dropoff_address}`;

// Google Maps directions link for the driver's phone.
export function mapsLink(from: string, to: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;
}
