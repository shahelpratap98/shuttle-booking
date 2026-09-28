import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Job, JobMoney, Profile, Result, Settings, TimeOff, Vehicle } from "@/lib/types";
import type { Customer, Store } from "./types";

const PROFILE_COLS = "user_id, display_name, email, phone, role, colour, pay_rate, is_active";
const JOB_COLS =
  "id, job_no, booking_ref, status, service_type, pickup_date, pickup_time, duration_min, pickup_address, dropoff_address, passengers, luggage, flight_no, customer_name, customer_phone, customer_email, booking_source, driver_id, vehicle_id, linked_job_id, is_shared, driver_pay, collect_amount, collected_via, notes, driver_notes, distance_km, created_at, completed_at";
const MONEY_COLS = "price, fuel_cost, tolls_parking, other_cost, payment_status, payment_method, paid_on";

const DEFAULT_SETTINGS: Settings = { business_name: "Shuttle Bookings", currency: "NZD", timezone: "Pacific/Auckland" };

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
    ...(r as unknown as Job),
    job_no: Number(r.job_no),
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

  async settings() {
    const { data } = await this.db.from("settings").select("business_name, currency, timezone").eq("id", 1).maybeSingle();
    return (data as Settings) ?? DEFAULT_SETTINGS;
  }

  async saveSettings(s: Settings): Promise<Result> {
    const { error } = await this.db.from("settings").update(s).eq("id", 1);
    return error ? fail(friendly(error.message)) : done;
  }

  async jobs(q: Parameters<Store["jobs"]>[0]) {
    const office = await this.isOffice();
    let query = this.db.from("jobs").select(office ? `${JOB_COLS}, job_money(${MONEY_COLS})` : JOB_COLS);
    if (q.from) query = query.gte("pickup_date", q.from);
    if (q.to) query = query.lte("pickup_date", q.to);
    if (q.driverId) query = query.eq("driver_id", q.driverId);
    if (q.unassigned) query = query.is("driver_id", null);
    if (q.statuses?.length) query = query.in("status", q.statuses);
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
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(toJob);
  }

  async job(id: string) {
    const office = await this.isOffice();
    const { data } = await this.db
      .from("jobs")
      .select(office ? `${JOB_COLS}, job_money(${MONEY_COLS})` : JOB_COLS)
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
      .select("customer_name, customer_phone, customer_email")
      .order("created_at", { ascending: false })
      .limit(1500);
    const seen = new Map<string, Customer>();
    for (const r of data ?? []) {
      const key = String(r.customer_name).trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: r.customer_name, phone: r.customer_phone, email: r.customer_email });
    }
    return [...seen.values()];
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

  async signInLink(email: string): Promise<Result<{ link: string }>> {
    const admin = createAdminClient();
    if (!admin) return fail("Sign-in links need SUPABASE_SERVICE_ROLE_KEY set on the server. See README.md.");
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error) return fail(friendly(error.message));
    return { ok: true, data: { link: this.signInUrl(data.properties.hashed_token, "recovery") } };
  }

  async vehicles() {
    const { data } = await this.db.from("vehicles").select("id, name, registration, seats, cost_per_km, notes, is_active").order("name");
    return (data ?? []).map((v) => ({ ...v, cost_per_km: n(v.cost_per_km) }) as Vehicle);
  }

  async saveVehicle(id: string | null, v: Omit<Vehicle, "id">): Promise<Result> {
    const { error } = id ? await this.db.from("vehicles").update(v).eq("id", id) : await this.db.from("vehicles").insert(v);
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
