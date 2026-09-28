import type { BookingSource, JobStatus, PaymentStatus, Role, ServiceType } from "@/lib/types";

// Keep these lists in step with the check constraints in supabase/migrations.

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", dispatcher: "Office", driver: "Driver" };
export const ROLES: Role[] = ["owner", "dispatcher", "driver"];

export const STATUS_LABEL: Record<JobStatus, string> = {
  enquiry: "Enquiry",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
export const STATUSES: JobStatus[] = ["enquiry", "confirmed", "completed", "cancelled", "no_show"];

// Jobs that count as real work: they tie up a driver and are charged for.
export const BILLABLE: JobStatus[] = ["confirmed", "completed", "no_show"];

export const SERVICE_LABEL: Record<ServiceType, string> = {
  airport: "Airport transfer",
  corporate: "Corporate",
  event: "Event / wedding",
  tour: "Tour / sightseeing",
  school: "School run",
  charter: "Private charter",
  other: "Other",
};
export const SERVICES = Object.keys(SERVICE_LABEL) as ServiceType[];

export const SOURCE_LABEL: Record<BookingSource, string> = {
  phone: "Phone",
  email: "Email",
  website: "Website",
  walk_in: "Walk-in",
  repeat: "Repeat customer",
  agent: "Agent / partner",
  other: "Other",
};
export const SOURCES = Object.keys(SOURCE_LABEL) as BookingSource[];

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", paid: "Paid", invoiced: "Invoiced" };
export const PAYMENTS: PaymentStatus[] = ["unpaid", "invoiced", "paid"];

// Calendar colours offered for people. Picked to stay readable with white text.
export const COLOURS = ["#1d4ed8", "#15803d", "#be185d", "#c2410c", "#6d28d9", "#0e7490", "#a16207", "#b91c1c", "#4338ca", "#047857"];
export const UNASSIGNED_COLOUR = "#64748b";
