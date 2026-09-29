import type { Job } from "@/lib/types";

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
    return cents ? n.toFixed(2) : Math.round(n).toString();
  }
}

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-NZ", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const jobRef = (jobNo: number) => `J-${jobNo}`;

// The reference people know a booking by: theirs if it has one, else ours.
export const bookingRef = (j: Pick<Job, "booking_ref" | "job_no">) => j.booking_ref || jobRef(j.job_no);

// Money, the way the booking sheet does it:
//   Charge − Driver pay = the business's pay ("Trekway Pay")
// plus optional running expenses (fuel, tolls, other) for a true profit.
export const charge = (j: Job) => j.money?.price ?? 0;
export const expenses = (j: Job) => (j.money ? j.money.fuel_cost + j.money.tolls_parking + j.money.other_cost : 0);
export const businessPay = (j: Job) => charge(j) - j.driver_pay;
export const totalCost = (j: Job) => j.driver_pay + expenses(j);
export const profit = (j: Job) => charge(j) - totalCost(j);

// "Trekway Shuttle" -> "Trekway pay": the sheet's own name for the business's share.
export function shareLabel(businessName: string): string {
  const first = businessName.trim().split(/\s+/)[0];
  return first ? `${first} pay` : "Business pay";
}

export const route = (j: Pick<Job, "pickup_address" | "dropoff_address">) => `${j.pickup_address} → ${j.dropoff_address}`;

// Google Maps directions link for the driver's phone.
export function mapsLink(from: string, to: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;
}

// Directions from wherever the phone is now.
export function navigateLink(to: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}&travelmode=driving`;
}

// wa.me needs the number in international form without "+". NZ numbers are
// written 021…, so a leading 0 becomes 64. Returns null if it isn't a number.
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "64" + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : null;
}
