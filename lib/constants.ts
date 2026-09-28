import type { BookingSource, JobStatus, PaymentMethod, PaymentStatus, Role, ServiceType } from "@/lib/types";

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

// "TBC" is what the booking sheet puts in the Driver column until someone is given the job.
export const NO_DRIVER = "Driver TBC";

export const SERVICE_LABEL: Record<ServiceType, string> = {
  airport: "Airport transfer",
  cruise: "Cruise ship / port",
  tour: "Tour / day trip",
  transfer: "City / hotel transfer",
  event: "Event / wedding",
  corporate: "Corporate",
  school: "School run",
  charter: "Private charter",
  other: "Other",
};
export const SERVICES = Object.keys(SERVICE_LABEL) as ServiceType[];

export const SOURCE_LABEL: Record<BookingSource, string> = {
  website: "Website",
  whatsapp: "WhatsApp",
  text: "Text message",
  messenger: "Messenger",
  email: "Email",
  phone: "Phone call",
  repeat: "Repeat customer",
  agent: "Agent / partner",
  walk_in: "Walk-in",
  other: "Other",
};
export const SOURCES = Object.keys(SOURCE_LABEL) as BookingSource[];

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Not paid yet",
  pay_on_day: "Pay on the day",
  invoiced: "Invoiced",
  paid: "Paid",
};
export const PAYMENTS: PaymentStatus[] = ["pay_on_day", "unpaid", "invoiced", "paid"];

export const METHOD_LABEL: Record<PaymentMethod, string> = { online: "Online", cash: "Cash", card: "Card", bank: "Bank transfer" };
export const METHODS: PaymentMethod[] = ["online", "cash", "card", "bank"];

// Calendar colours offered for people. Picked to stay readable with white text.
export const COLOURS = ["#1d4ed8", "#15803d", "#be185d", "#c2410c", "#6d28d9", "#0e7490", "#a16207", "#b91c1c", "#4338ca", "#047857"];
export const UNASSIGNED_COLOUR = "#64748b";
