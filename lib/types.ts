export type Role = "owner" | "dispatcher" | "driver";
export type JobStatus = "enquiry" | "confirmed" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "unpaid" | "paid" | "invoiced";
export type ServiceType = "airport" | "corporate" | "event" | "tour" | "school" | "charter" | "other";
export type BookingSource = "phone" | "email" | "website" | "walk_in" | "repeat" | "agent" | "other";

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

export interface JobMoney {
  price: number;
  driver_cost: number;
  fuel_cost: number;
  tolls_parking: number;
  other_cost: number;
  payment_status: PaymentStatus;
}

export interface Job {
  id: string;
  job_no: number;
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
  notes: string | null;
  driver_notes: string | null;
  distance_km: number | null;
  created_at: string; // ISO timestamp
  completed_at: string | null;
  // Only present for the office. Drivers never receive it.
  money?: JobMoney | null;
}

export type JobInput = Omit<Job, "id" | "job_no" | "driver_notes" | "created_at" | "completed_at" | "money">;

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
