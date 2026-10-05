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
  cof_due: string | null; // YYYY-MM-DD: certificate of fitness
  rego_due: string | null; // registration (licence) renewal
  service_due: string | null;
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
  amount_paid: number; // paid so far, before the rest is due (deposits, part payments)
  invoice_no: string | null; // e.g. INV-0092
  bill_to: string | null; // who the invoice goes to, when it isn't the passenger
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
  operator: string | null; // given to another operator (e.g. Quick Shuttle) instead of one of ours
  children: number; // of the passengers
  infants: number; // of the passengers
  flag_note: string | null; // the office's "look at this" marker
  series_id: string | null; // trips made together by "Repeat this booking"
  booked_on: string | null; // the day the booking was taken (null = not known)
  driver_settled_on: string | null; // when the driver was paid for it (and any cash settled)
  created_at: string; // ISO timestamp
  completed_at: string | null;
  // Only present for the office. Drivers never receive it.
  money?: JobMoney | null;
}

// What the booking form and the importer save. booked_on, flag_note and
// series_id are left out (so they keep their saved value) unless given.
export type JobInput = Omit<
  Job,
  "id" | "job_no" | "driver_notes" | "created_at" | "completed_at" | "money" | "collect_amount" | "collected_via" | "driver_settled_on" | "booked_on" | "flag_note" | "series_id"
> & { booked_on?: string | null; flag_note?: string | null; series_id?: string | null };

export interface TimeOff {
  id: string;
  user_id: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
}

// Enquiries that came in on a day (the old "Lead Record" tab).
export interface LeadDay {
  day: string; // YYYY-MM-DD
  leads: number;
  local: number | null; // of those, local (Auckland) trips
  note: string | null;
}

// A running cost for a month that isn't tied to one job.
export interface Overhead {
  id: string;
  month: string; // YYYY-MM-01
  category: string; // "Google ads", "Staff", "Fuel card"…
  amount: number;
  note: string | null;
}

export interface Settings {
  business_name: string;
  currency: string;
  timezone: string;
  gst_registered: boolean; // prices include GST (15%)
}

export interface JobQuery {
  from?: string; // pickup_date >= from
  to?: string; // pickup_date <= to
  driverId?: string;
  unassigned?: boolean;
  statuses?: JobStatus[];
  search?: string;
  customerKey?: string; // the same customer: lib/customers.ts customerKey()
  bookedFrom?: string; // booked_on >= (when the booking was taken)
  bookedTo?: string; // booked_on <=
  seriesId?: string; // trips made together by "Repeat this booking"
  unsettled?: boolean; // the driver hasn't been paid for it yet
  flagged?: boolean; // the office has flagged it
  order?: "asc" | "desc";
  limit?: number;
}

// Server actions answer with this.
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
