import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Job, JobMoney, LeadDay, Overhead, PaymentMethod, Profile, Result, Settings, TimeOff, Vehicle } from "@/lib/types";
import { JOB_DEFAULTS, MONEY_DEFAULTS, VEHICLE_DEFAULTS } from "./defaults";
import { customersFrom } from "@/lib/customers";
import type { Customer, Store } from "./types";

const PROFILE_COLS = "user_id, display_name, email, phone, role, colour, pay_rate, is_active";
const JOB_COLS_V1 =
  "id, job_no, booking_ref, status, service_type, pickup_date, pickup_time, duration_min, pickup_address, dropoff_address, passengers, luggage, flight_no, customer_name, customer_phone, customer_email, booking_source, driver_id, vehicle_id, linked_job_id, is_shared, driver_pay, collect_amount, collected_via, notes, driver_notes, distance_km, created_at, completed_at";
const MONEY_COLS_V1 = "price, fuel_cost, tolls_parking, other_cost, payment_status, payment_method, paid_on";
const VEHICLE_COLS_V1 = "id, name, registration, seats, cost_per_km, notes, is_active";
// Added by migration 20261006000100.
const JOB_COLS_V2 = `${JOB_COLS_V1}, operator, children, infants, flag_note, series_id, booked_on, driver_settled_on`;
const MONEY_COLS_V2 = `${MONEY_COLS_V1}, amount_paid, invoice_no, bill_to`;
const VEHICLE_COLS_V2 = `${VEHICLE_COLS_V1}, cof_due, rego_due, service_due`;
const NEEDS_UPDATE = "This needs the latest database update: run supabase/migrations/20261006000100_excel_parity.sql in Supabase (see README).";

const DEFAULT_SETTINGS: Settings = { business_name: "Shuttle Bookings", currency: "NZD", timezone: "Pacific/Auckland", gst_registered: false };

// Has the live database had migration 20261006000100? Checked once, then
// re-checked at most once a minute until it has, so the app keeps working
// (without the new fields) if the code is deployed before the SQL is run.
let migrated: boolean | null = null;
let checkedAt = 0;
async function hasV2(db: SupabaseClient): Promise<boolean> {
  if (migrated || (migrated === false && Date.now() - checkedAt < 60_000)) return migrated;
  const { error } = await db.from("settings").select("gst_registered").limit(1);
  migrated = !error;
  checkedAt = Date.now();
  return migrated;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = { ok: true as const, data: undefined };

// Turns database wording into something the person can act on.
function friendly(message: string): string {
  if (/duplicate key|already exists/i.test(message)) return "That name is already in use.";
  if (/violates foreign key/i.test(message)) return "That's still used by existing jobs, so it can't be removed. Mark it inactive instead.";
  if (/row-level security|permission denied|insufficient/i.test(message)) return "You don't have permission to do that.";
  if (/check constraint/i.test(message)) return "One of the values is outside what's allowed. Check the form and try again.";
  return message;
}

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toJob(r: Row): Job {
  const m = r.job_money as Row | Row[] | null | undefined;
  const moneyRow = Array.isArray(m) ? m[0] : m;
  return {
    ...JOB_DEFAULTS,
    ...(r as unknown as Job),
    job_no: Number(r.job_no),
    children: Number(r.children ?? 0),
    infants: Number(r.infants ?? 0),
    pickup_time: String(r.pickup_time).slice(0, 5),
    distance_km: n(r.distance_km),
    driver_pay: Number(r.driver_pay ?? 0),
    collect_amount: Number(r.collect_amount ?? 0),
    money: moneyRow
      ? {
          price: Number(moneyRow.price),
          fuel_cost: Number(moneyRow.fuel_cost),
          tolls_parking: Number(moneyRow.tolls_parking),
          other_cost: Number(moneyRow.other_cost),
          payment_status: moneyRow.payment_status as JobMoney["payment_status"],
          payment_method: (moneyRow.payment_method as JobMoney["payment_method"]) ?? null,
          paid_on: (moneyRow.paid_on as string | null) ?? null,
          amount_paid: Number(moneyRow.amount_paid ?? MONEY_DEFAULTS.amount_paid),
          invoice_no: (moneyRow.invoice_no as string | null) ?? null,
          bill_to: (moneyRow.bill_to as string | null) ?? null,
        }
      : r.job_money === undefined
        ? undefined
        : null,
  };
}

// Strip the characters PostgREST's filter syntax gives meaning to.
const cleanSearch = (q: string) => q.replace(/[,()%*\\:"']/g, " ").trim();

class SupabaseStore implements Store {
  readonly mode = "live" as const;
  constructor(private db: SupabaseClient) {}

  private _viewer: Promise<Profile | null> | null = null;
  viewer() {
    this._viewer ??= (async () => {
      const { data: auth } = await this.db.auth.getClaims();
      const userId = auth?.claims?.sub;
      if (!userId) return null;
      const { data } = await this.db.from("profiles").select(PROFILE_COLS).eq("user_id", userId).maybeSingle();
      return data ? ({ ...data, pay_rate: n(data.pay_rate) } as Profile) : null;
    })();
    return this._viewer;
  }

  private async isOffice() {
    const v = await this.viewer();
    return v?.role === "owner" || v?.role === "dispatcher";
  }

  private v2() {
    return hasV2(this.db);
  }
  private async cols() {
    const v2 = await this.v2();
    return { job: v2 ? JOB_COLS_V2 : JOB_COLS_V1, money: v2 ? MONEY_COLS_V2 : MONEY_COLS_V1 };
  }

  async settings() {
    const v2 = await this.v2();
    const { data } = await this.db
      .from("settings")
      .select(v2 ? "business_name, currency, timezone, gst_registered" : "business_name, currency, timezone")
      .eq("id", 1)
      .maybeSingle();
    return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings> | null) ?? {}) };
  }

  async saveSettings(s: Settings): Promise<Result> {
    const v2 = await this.v2();
    if (!v2 && s.gst_registered) return fail(NEEDS_UPDATE);
    const v1 = { business_name: s.business_name, currency: s.currency, timezone: s.timezone };
    const { error } = await this.db.from("settings").update(v2 ? s : v1).eq("id", 1);
    return error ? fail(friendly(error.message)) : done;
  }

  async jobs(q: Parameters<Store["jobs"]>[0]) {
    const office = await this.isOffice();
    const v2 = await this.v2();
    const c = await this.cols();
    if (!v2 && (q.bookedFrom || q.bookedTo || q.seriesId || q.unsettled || q.flagged)) return [];
    let query = this.db.from("jobs").select(office ? `${c.job}, job_money(${c.money})` : c.job);
    if (q.from) query = query.gte("pickup_date", q.from);
    if (q.to) query = query.lte("pickup_date", q.to);
    if (q.bookedFrom) query = query.gte("booked_on", q.bookedFrom);
    if (q.bookedTo) query = query.lte("booked_on", q.bookedTo);
    if (q.seriesId) query = query.eq("series_id", q.seriesId);
    if (q.unsettled) query = query.is("driver_settled_on", null);
    if (q.flagged) query = query.not("flag_note", "is", null);
    if (q.driverId) query = query.eq("driver_id", q.driverId);
    // "Driver TBC": nobody of ours, and not given to another operator either.
    if (q.unassigned) query = v2 ? query.is("driver_id", null).is("operator", null) : query.is("driver_id", null);
    if (q.statuses?.length) query = query.in("status", q.statuses);
    if (q.customerKey) query = query.eq("customer_key", q.customerKey);
    if (q.search) {
      const s = cleanSearch(q.search);
      const num = /^j-?(\d+)$/i.exec(s)?.[1];
      if (num) query = query.eq("job_no", Number(num));
      else if (s) {
        const like = `%${s}%`;
        query = query.or(
          ["booking_ref", "customer_name", "customer_phone", "customer_email", "pickup_address", "dropoff_address", "flight_no", "notes"]
            .map((c) => `${c}.ilike.${like}`)
            .join(","),
        );
      }
    }
    const asc = (q.order ?? "asc") === "asc";
    query = query.order("pickup_date", { ascending: asc }).order("pickup_time", { ascending: asc }).limit(q.limit ?? 5000);
    const { data, error } = await query;
    if (error) {
      if (q.customerKey) return []; // customer_key arrives with the 20260930000100 migration
      throw new Error(error.message);
    }
    return (data as unknown as Row[]).map(toJob);
  }

  async job(id: string) {
    const office = await this.isOffice();
    const c = await this.cols();
    const { data } = await this.db
      .from("jobs")
      .select(office ? `${c.job}, job_money(${c.money})` : c.job)
      .eq("id", id)
      .maybeSingle();
    return data ? toJob(data as unknown as Row) : null;
  }

  async saveJob(id: string | null, input: Parameters<Store["saveJob"]>[1], money: JobMoney | null): Promise<Result<string>> {
    const { data, error } = await this.db.rpc("save_job", { p_id: id, p_job: input, p_money: money });
    if (error) return fail(friendly(error.message));
    return { ok: true, data: data as string };
  }

  async assignJob(id: string, driverId: string | null, vehicleId: string | null): Promise<Result> {
    const { data, error } = await this.db.from("jobs").update({ driver_id: driverId, vehicle_id: vehicleId }).eq("id", id).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That job couldn't be found.");
  }

  async setJobStatus(id: string, status: Job["status"]): Promise<Result> {
    const { data, error } = await this.db.from("jobs").update({ status }).eq("id", id).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That job couldn't be found.");
  }

  async deleteJob(id: string): Promise<Result> {
    const { data, error } = await this.db.from("jobs").delete().eq("id", id).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That job couldn't be found.");
  }

  async driverUpdateJob(id: string, status: Job["status"], driverNotes: string | null, distanceKm: number | null, collectedVia: Job["collected_via"]): Promise<Result> {
    const { error } = await this.db.rpc("driver_update_job", {
      p_job_id: id,
      p_status: status,
      p_driver_notes: driverNotes,
      p_distance_km: distanceKm,
      p_collected_via: collectedVia,
    });
    return error ? fail(friendly(error.message)) : done;
  }

  async recentCustomers(): Promise<Customer[]> {
    const { data } = await this.db
      .from("jobs")
      .select("id, customer_name, customer_phone, customer_email, status, pickup_date, linked_job_id")
      .order("created_at", { ascending: false })
      .limit(3000);
    return customersFrom((data ?? []) as Parameters<typeof customersFrom>[0]);
  }

  // Needs the 20260930000100 migration; until it has been run, nobody is
  // flagged rather than the page failing.
  async repeatCounts(ids: string[]): Promise<Record<string, number>> {
    if (!ids.length) return {};
    const { data, error } = await this.db.rpc("repeat_counts", { p_job_ids: ids });
    if (error) return {};
    return Object.fromEntries((data as { job_id: string; earlier: number }[]).map((r) => [r.job_id, Number(r.earlier)]));
  }

  async settleDriverPay(jobIds: string[], on: string | null): Promise<Result> {
    if (!jobIds.length) return done;
    if (!(await this.v2())) return fail(NEEDS_UPDATE);
    const { data, error } = await this.db.from("jobs").update({ driver_settled_on: on }).in("id", jobIds).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("You don't have permission to do that.");
  }

  async setFlag(jobId: string, note: string | null): Promise<Result> {
    if (!(await this.v2())) return fail(NEEDS_UPDATE);
    const { data, error } = await this.db.from("jobs").update({ flag_note: note }).eq("id", jobId).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That job couldn't be found.");
  }

  async markPaid(jobIds: string[], on: string, method: PaymentMethod | null): Promise<Result> {
    if (!jobIds.length) return done;
    const { data, error } = await this.db
      .from("job_money")
      .update({ payment_status: "paid", paid_on: on, payment_method: method })
      .in("job_id", jobIds)
      .select("job_id");
    if (error) return fail(friendly(error.message));
    // Paid now, so there's nothing left for a driver to collect.
    await this.db.from("jobs").update({ collect_amount: 0 }).in("id", jobIds).is("collected_via", null);
    return data?.length ? done : fail("You don't have permission to do that.");
  }

  async leads(from: string, to: string): Promise<LeadDay[]> {
    if (!(await this.v2())) return [];
    const { data } = await this.db.from("lead_days").select("day, leads, local, note").gte("day", from).lte("day", to).order("day");
    return (data ?? []) as LeadDay[];
  }

  async saveLeads(l: LeadDay): Promise<Result> {
    if (!(await this.v2())) return fail(NEEDS_UPDATE);
    const { error } = await this.db.from("lead_days").upsert(l, { onConflict: "day" });
    return error ? fail(friendly(error.message)) : done;
  }

  async overheads(from: string, to: string): Promise<Overhead[]> {
    if (!(await this.v2())) return [];
    const { data } = await this.db.from("overheads").select("id, month, category, amount, note").gte("month", from).lte("month", to).order("month").order("category");
    return (data ?? []).map((o) => ({ ...o, amount: Number(o.amount) }) as Overhead);
  }

  async saveOverhead(id: string | null, o: Omit<Overhead, "id">): Promise<Result> {
    if (!(await this.v2())) return fail(NEEDS_UPDATE);
    const { error } = id ? await this.db.from("overheads").update(o).eq("id", id) : await this.db.from("overheads").insert(o);
    return error ? fail(friendly(error.message)) : done;
  }

  async deleteOverhead(id: string): Promise<Result> {
    const { data, error } = await this.db.from("overheads").delete().eq("id", id).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That cost couldn't be found.");
  }

  async weeklyTarget(): Promise<number | null> {
    if (!(await this.isOffice())) return null;
    const { data, error } = await this.db.from("targets").select("weekly_booking_target").eq("id", 1).maybeSingle();
    return error || !data ? null : n(data.weekly_booking_target);
  }

  async saveWeeklyTarget(amount: number | null): Promise<Result> {
    const { data, error } = await this.db.from("targets").update({ weekly_booking_target: amount }).eq("id", 1).select("id");
    if (error) return fail(/targets/.test(error.message) ? "Targets need the latest database update (see README: 20260930000100_totals_repeat.sql)." : friendly(error.message));
    return data?.length ? done : fail("You don't have permission to do that.");
  }

  async people() {
    const { data } = await this.db.from("profiles").select(PROFILE_COLS).order("display_name");
    return (data ?? []).map((p) => ({ ...p, pay_rate: n(p.pay_rate) }) as Profile);
  }

  async savePerson(userId: string, patch: Parameters<Store["savePerson"]>[1]): Promise<Result> {
    const { data, error } = await this.db.from("profiles").update(patch).eq("user_id", userId).select("user_id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("You don't have permission to change the team.");
  }

  private signInUrl(hashedToken: string, type: "invite" | "recovery") {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=/set-password`;
  }

  async invitePerson(p: { name: string; email: string; role: Profile["role"]; phone: string | null }): Promise<Result<{ link?: string }>> {
    const admin = createAdminClient();
    if (!admin) return fail("Adding people needs SUPABASE_SERVICE_ROLE_KEY set on the server. See README.md.");
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: p.email,
      options: { data: { display_name: p.name } },
    });
    if (error || !data.user) return fail(friendly(error?.message ?? "The invite couldn't be created."));

    // The auth trigger made them a driver; set the details the owner entered.
    const { error: upd } = await this.db
      .from("profiles")
      .update({ display_name: p.name, role: p.role, phone: p.phone })
      .eq("user_id", data.user.id);
    if (upd) return fail(friendly(upd.message));
    return { ok: true, data: { link: this.signInUrl(data.properties.hashed_token, "invite") } };
  }

  async changeEmail(userId: string, email: string): Promise<Result> {
    const admin = createAdminClient();
    if (!admin) return fail("Changing an email needs SUPABASE_SERVICE_ROLE_KEY set on the server. See README.md.");
    // Confirmed straight away, so nothing is emailed and they sign in with the new one.
    const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) return fail(/already|registered|exists/i.test(error.message) ? "Someone else already uses that email." : error.message);
    const { error: upd } = await admin.from("profiles").update({ email }).eq("user_id", userId);
    if (upd) return fail(friendly(upd.message));
    return done;
  }

  async signInLink(email: string): Promise<Result<{ link: string }>> {
    const admin = createAdminClient();
    if (!admin) return fail("Sign-in links need SUPABASE_SERVICE_ROLE_KEY set on the server. See README.md.");
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error) return fail(friendly(error.message));
    return { ok: true, data: { link: this.signInUrl(data.properties.hashed_token, "recovery") } };
  }

  async vehicles() {
    const v2 = await this.v2();
    const { data } = await this.db.from("vehicles").select(v2 ? VEHICLE_COLS_V2 : VEHICLE_COLS_V1).order("name");
    return ((data ?? []) as unknown as Row[]).map((v) => ({ ...VEHICLE_DEFAULTS, ...v, cost_per_km: n(v.cost_per_km) }) as Vehicle);
  }

  async saveVehicle(id: string | null, v: Omit<Vehicle, "id">): Promise<Result> {
    const v2 = await this.v2();
    const { cof_due, rego_due, service_due, ...v1 } = v;
    if (!v2 && (cof_due || rego_due || service_due)) return fail(NEEDS_UPDATE);
    const row = v2 ? v : v1;
    const { error } = id ? await this.db.from("vehicles").update(row).eq("id", id) : await this.db.from("vehicles").insert(row);
    return error ? fail(friendly(error.message)) : done;
  }

  async timeOff(from: string, to: string) {
    const { data } = await this.db
      .from("time_off")
      .select("id, user_id, starts_on, ends_on, note")
      .lte("starts_on", to)
      .gte("ends_on", from)
      .order("starts_on");
    return (data ?? []) as TimeOff[];
  }

  async addTimeOff(t: Omit<TimeOff, "id">): Promise<Result> {
    const { error } = await this.db.from("time_off").insert(t);
    return error ? fail(friendly(error.message)) : done;
  }

  async deleteTimeOff(id: string): Promise<Result> {
    const { data, error } = await this.db.from("time_off").delete().eq("id", id).select("id");
    if (error) return fail(friendly(error.message));
    return data?.length ? done : fail("That time off couldn't be found.");
  }
}

// One store per request, so the viewer lookup happens once.
export const supabaseStore = cache(async (): Promise<Store> => new SupabaseStore(await createClient()));
