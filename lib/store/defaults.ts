// Values for the fields added by migration 20261006000100, for rows saved
// before it (demo data on disk, or a live database that hasn't had it yet).
export const JOB_DEFAULTS = { operator: null, children: 0, infants: 0, flag_note: null, series_id: null, booked_on: null, driver_settled_on: null } as const;
export const MONEY_DEFAULTS = { amount_paid: 0, invoice_no: null, bill_to: null } as const;
export const VEHICLE_DEFAULTS = { cof_due: null, rego_due: null, service_due: null } as const;
