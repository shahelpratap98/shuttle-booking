import { PAYMENTS, SERVICES, SOURCES, STATUSES } from "@/lib/constants";
import { isIsoDate, isTime } from "@/lib/dates";
import type { JobInput, JobMoney } from "@/lib/types";

// Reads and checks the job form. Returns the values, or the first problem in
// words the person can act on. The database re-checks everything.

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const textOrNull = (fd: FormData, name: string, max: number) => text(fd, name).slice(0, max) || null;

function number(fd: FormData, name: string, label: string, min: number, max: number, opts: { int?: boolean; optional?: boolean } = {}): number | null | string {
  const raw = text(fd, name).replace(/[$,\s]/g, "");
  if (raw === "") return opts.optional ? null : min;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  if (opts.int && !Number.isInteger(n)) return `${label} must be a whole number.`;
  return opts.int ? n : Math.round(n * 100) / 100;
}

export function parseJobForm(fd: FormData): { input: JobInput; money: JobMoney } | { error: string } {
  const pickup_date = text(fd, "pickup_date");
  const pickup_time = text(fd, "pickup_time").slice(0, 5);
  if (!isIsoDate(pickup_date)) return { error: "Enter the pickup date." };
  if (!isTime(pickup_time)) return { error: "Enter the pickup time." };

  const pickup_address = text(fd, "pickup_address").slice(0, 200);
  const dropoff_address = text(fd, "dropoff_address").slice(0, 200);
  if (!pickup_address) return { error: "Enter where to pick up." };
  if (!dropoff_address) return { error: "Enter where to drop off." };
  const customer_name = text(fd, "customer_name").slice(0, 120);
  if (!customer_name) return { error: "Enter the customer's name." };

  const status = text(fd, "status");
  const service_type = text(fd, "service_type");
  const booking_source = text(fd, "booking_source");
  if (!STATUSES.includes(status as never)) return { error: "Pick a status." };
  if (!SERVICES.includes(service_type as never)) return { error: "Pick a service." };
  if (!SOURCES.includes(booking_source as never)) return { error: "Pick how the booking came in." };

  const nums = {
    duration_min: number(fd, "duration_min", "Duration", 5, 1440, { int: true }),
    passengers: number(fd, "passengers", "Passengers", 1, 99, { int: true }),
    luggage: number(fd, "luggage", "Bags", 0, 199, { int: true }),
    distance_km: number(fd, "distance_km", "Distance", 0, 5000, { optional: true }),
    price: number(fd, "price", "Price", 0, 1_000_000),
    driver_cost: number(fd, "driver_cost", "Driver cost", 0, 1_000_000),
    fuel_cost: number(fd, "fuel_cost", "Fuel cost", 0, 1_000_000),
    tolls_parking: number(fd, "tolls_parking", "Tolls and parking", 0, 1_000_000),
    other_cost: number(fd, "other_cost", "Other cost", 0, 1_000_000),
  };
  for (const v of Object.values(nums)) if (typeof v === "string") return { error: v };
  const N = nums as Record<keyof typeof nums, number | null>;

  const payment_status = text(fd, "payment_status");
  if (!PAYMENTS.includes(payment_status as never)) return { error: "Pick a payment status." };

  const email = text(fd, "customer_email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "The customer's email doesn't look right." };

  return {
    input: {
      status: status as JobInput["status"],
      service_type: service_type as JobInput["service_type"],
      pickup_date,
      pickup_time,
      duration_min: N.duration_min ?? 60,
      pickup_address,
      dropoff_address,
      passengers: N.passengers ?? 1,
      luggage: N.luggage ?? 0,
      flight_no: textOrNull(fd, "flight_no", 20)?.toUpperCase() ?? null,
      customer_name,
      customer_phone: textOrNull(fd, "customer_phone", 40),
      customer_email: email.slice(0, 120) || null,
      booking_source: booking_source as JobInput["booking_source"],
      driver_id: text(fd, "driver_id") || null,
      vehicle_id: text(fd, "vehicle_id") || null,
      notes: textOrNull(fd, "notes", 1000),
      distance_km: N.distance_km,
    },
    money: {
      price: N.price ?? 0,
      driver_cost: N.driver_cost ?? 0,
      fuel_cost: N.fuel_cost ?? 0,
      tolls_parking: N.tolls_parking ?? 0,
      other_cost: N.other_cost ?? 0,
      payment_status: payment_status as JobMoney["payment_status"],
    },
  };
}
