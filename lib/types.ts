export type Role = "owner" | "dispatcher" | "driver";
export type JobStatus = "enquiry" | "confirmed" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "unpaid" | "pay_on_day" | "invoiced" | "paid";
export type PaymentMethod = "online" | "cash" | "card" | "bank";
export type ServiceType = "airport" | "cruise" | "tour" | "transfer" | "event" | "corporate" | "school" | "charter" | "other";
export type BookingSource = "phone" | "text" | "whatsapp" | "messenger" | "email" | "website" | "repeat" | "agent" | "walk_in" | "other";

export interface Profile {
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  role: Role;
  colour: string;
  pay_rate: number | null; // per hour
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  registration: string | null;
  seats: number | null;
  cost_per_km: number | null;
  notes: string | null;
  is_active: boolean;
}

// Office-only money. Driver pay is on the job itself (the driver may see it).
export interface JobMoney {
  price: number; // the charge to the customer
  fuel_cost: number;
  tolls_parking: number;
  other_cost: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  paid_on: string | null; // YYYY-MM-DD
}

export interface Job {
  id: string;
  job_no: number;
  booking_ref: string | null; // the business's own reference, e.g. TW-20260910-024
  status: JobStatus;
  service_type: ServiceType;
  pickup_date: string; // YYYY-MM-DD, local
  pickup_time: string; // HH:MM, local
  duration_min: number;
  pickup_address: string;
  dropoff_address: string;
  passengers: number;
  luggage: number;
  flight_no: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  booking_source: BookingSource;
  driver_id: string | null;
  vehicle_id: string | null;
  linked_job_id: string | null; // the other leg of a there-and-back booking
  is_shared: boolean; // one trip carrying several bookings
  driver_pay: number;
  collect_amount: number; // what the driver collects on the day (0 if prepaid)
  collected_via: PaymentMethod | null;
  notes: string | null;
  driver_notes: string | null;
  distance_km: number | null;
  created_at: string; // ISO timestamp
  completed_at: string | null;
  // Only present for the office. Drivers never receive it.
  money?: JobMoney | null;
}

export type JobInput = Omit<Job, "id" | "job_no" | "driver_notes" | "created_at" | "completed_at" | "money" | "collect_amount" | "collected_via">;

export interface TimeOff {
  id: string;
  user_id: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
}

export interface Settings {
  business_name: string;
  currency: string;
  timezone: string;
}

export interface JobQuery {
  from?: string; // pickup_date >= from
  to?: string; // pickup_date <= to
  driverId?: string;
  unassigned?: boolean;
  statuses?: JobStatus[];
  search?: string;
  order?: "asc" | "desc";
  limit?: number;
}

// Server actions answer with this.
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
