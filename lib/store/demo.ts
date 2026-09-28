import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { todayIn } from "@/lib/dates";
import type { Job, JobMoney, JobQuery, Profile, Result, TimeOff, Vehicle } from "@/lib/types";
import { seedDemo, type DemoData } from "./demo-seed";
import type { Customer, PersonPatch, Store, VehicleInput } from "./types";

// Demo mode: runs when no Supabase project is configured. Sample data lives in
// this server process's memory (a restart resets it) and the same access rules
// as the database's row-level security are applied here by hand.

export const DEMO_COOKIE = "demo_user";

// Bump when the sample data changes shape, so a running dev server reseeds.
const SEED_VERSION = 3;
const g = globalThis as unknown as { __shuttleDemo?: DemoData & { version?: number } };
function data(): DemoData {
  if (g.__shuttleDemo?.version !== SEED_VERSION) g.__shuttleDemo = { ...seedDemo(todayIn("Pacific/Auckland")), version: SEED_VERSION };
  return g.__shuttleDemo;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = { ok: true as const, data: undefined };
const clone = <T>(x: T): T => structuredClone(x);

class DemoStore implements Store {
  readonly mode = "demo" as const;
  constructor(private userId: string | null) {}

  async viewer() {
    const p = data().profiles.find((x) => x.user_id === this.userId && x.is_active);
    return p ? clone(p) : null;
  }

  private me() {
    return data().profiles.find((x) => x.user_id === this.userId && x.is_active) ?? null;
  }
  private office() {
    const r = this.me()?.role;
    return r === "owner" || r === "dispatcher";
  }
  private owner() {
    return this.me()?.role === "owner";
  }
  private visible(j: Job) {
    return this.office() || (this.me() !== null && j.driver_id === this.userId);
  }
  private out(j: Job): Job {
    const c = clone(j);
    if (!this.office()) delete c.money; // drivers never receive money
    return c;
  }

  async settings() {
    return clone(data().settings);
  }
  async saveSettings(s: Parameters<Store["saveSettings"]>[0]): Promise<Result> {
    if (!this.owner()) return fail("You don't have permission to do that.");
    data().settings = { ...s };
    return done;
  }

  async jobs(q: JobQuery) {
    const s = q.search?.trim().toLowerCase() ?? "";
    const num = /^j-?(\d+)$/i.exec(s)?.[1];
    let list = data().jobs.filter((j) => {
      if (!this.visible(j)) return false;
      if (q.from && j.pickup_date < q.from) return false;
      if (q.to && j.pickup_date > q.to) return false;
      if (q.driverId && j.driver_id !== q.driverId) return false;
      if (q.unassigned && j.driver_id !== null) return false;
      if (q.statuses?.length && !q.statuses.includes(j.status)) return false;
      if (num) return j.job_no === Number(num);
      if (s) {
        const hay = [j.booking_ref, j.customer_name, j.customer_phone, j.customer_email, j.pickup_address, j.dropoff_address, j.flight_no, j.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const dir = (q.order ?? "asc") === "asc" ? 1 : -1;
    list = list.sort((a, b) => dir * (a.pickup_date + a.pickup_time).localeCompare(b.pickup_date + b.pickup_time));
    return list.slice(0, q.limit ?? 5000).map((j) => this.out(j));
  }

  async job(id: string) {
    const j = data().jobs.find((x) => x.id === id);
    return j && this.visible(j) ? this.out(j) : null;
  }

  async saveJob(id: string | null, input: Parameters<Store["saveJob"]>[1], money: JobMoney | null): Promise<Result<string>> {
    if (!this.office()) return fail("Only the owner or office staff can create or edit jobs.");
    const d = data();
    // Same rule as public.save_job: collect the charge on the day when that's
    // how they're paying, keep what a driver already collected, else nothing.
    const collectFor = (existing?: Job) =>
      money?.payment_status === "pay_on_day" ? money.price : existing?.collected_via ? existing.collect_amount : 0;
    const link = (jobId: string) => {
      const other = input.linked_job_id ? d.jobs.find((x) => x.id === input.linked_job_id) : undefined;
      if (other && !other.linked_job_id) other.linked_job_id = jobId;
    };
    if (id) {
      const j = d.jobs.find((x) => x.id === id);
      if (!j) return fail("That job no longer exists.");
      const wasCompleted = j.status === "completed";
      const collect = collectFor(j);
      Object.assign(j, input, { collect_amount: collect });
      if (money) j.money = { ...money };
      j.completed_at = j.status === "completed" ? (wasCompleted ? j.completed_at : new Date().toISOString()) : null;
      link(id);
      return { ok: true, data: id };
    }
    const newId = crypto.randomUUID();
    d.jobs.push({
      ...input,
      id: newId,
      job_no: d.nextJobNo++,
      collect_amount: collectFor(),
      collected_via: null,
      driver_notes: null,
      created_at: new Date().toISOString(),
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
      money: money ? { ...money } : null,
    });
    link(newId);
    return { ok: true, data: newId };
  }

  async assignJob(id: string, driverId: string | null, vehicleId: string | null): Promise<Result> {
    if (!this.office()) return fail("You don't have permission to do that.");
    const j = data().jobs.find((x) => x.id === id);
    if (!j) return fail("That job couldn't be found.");
    j.driver_id = driverId;
    j.vehicle_id = vehicleId;
    return done;
  }

  async setJobStatus(id: string, status: Job["status"]): Promise<Result> {
    if (!this.office()) return fail("You don't have permission to do that.");
    const j = data().jobs.find((x) => x.id === id);
    if (!j) return fail("That job couldn't be found.");
    if (status === "completed" && j.status !== "completed") j.completed_at = new Date().toISOString();
    if (status !== "completed") j.completed_at = null;
    j.status = status;
    return done;
  }

  async deleteJob(id: string): Promise<Result> {
    if (!this.office()) return fail("You don't have permission to do that.");
    const d = data();
    const before = d.jobs.length;
    d.jobs = d.jobs.filter((x) => x.id !== id);
    return d.jobs.length < before ? done : fail("That job couldn't be found.");
  }

  async driverUpdateJob(id: string, status: Job["status"], driverNotes: string | null, distanceKm: number | null, collectedVia: Job["collected_via"]): Promise<Result> {
    const j = data().jobs.find((x) => x.id === id);
    if (!j || !this.me() || j.driver_id !== this.userId) return fail("That job isn't assigned to you.");
    if (!["confirmed", "completed", "no_show"].includes(status)) return fail("Drivers can mark a job done or no-show, nothing else.");
    if (!["confirmed", "completed", "no_show"].includes(j.status)) return fail(`This job is ${j.status}, so only the office can change it.`);
    if (collectedVia && j.collect_amount <= 0) return fail("There's nothing to collect on this job.");
    if (collectedVia) {
      j.collected_via = collectedVia;
      if (j.money) Object.assign(j.money, { payment_status: "paid", payment_method: collectedVia, paid_on: todayIn(data().settings.timezone) });
    }
    if (status === "completed" && j.status !== "completed") j.completed_at = new Date().toISOString();
    if (status !== "completed") j.completed_at = null;
    j.status = status;
    j.driver_notes = driverNotes?.trim() || null;
    if (distanceKm !== null) j.distance_km = distanceKm;
    return done;
  }

  async recentCustomers(): Promise<Customer[]> {
    if (!this.office()) return [];
    const seen = new Map<string, Customer>();
    for (const j of [...data().jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const key = j.customer_name.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: j.customer_name, phone: j.customer_phone, email: j.customer_email });
    }
    return [...seen.values()];
  }

  async people() {
    const list = this.office() ? data().profiles : data().profiles.filter((p) => p.user_id === this.userId);
    return clone(list).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  async savePerson(userId: string, patch: PersonPatch): Promise<Result> {
    if (!this.owner()) return fail("You don't have permission to change the team.");
    const d = data();
    const p = d.profiles.find((x) => x.user_id === userId);
    if (!p) return fail("That person couldn't be found.");
    const next = d.profiles.map((x) => (x.user_id === userId ? { ...x, ...patch } : x));
    if (!next.some((x) => x.role === "owner" && x.is_active)) return fail("There must always be at least one active owner.");
    Object.assign(p, patch);
    return done;
  }

  async invitePerson(p: { name: string; email: string; role: Profile["role"]; phone: string | null }): Promise<Result<{ link?: string }>> {
    if (!this.owner()) return fail("You don't have permission to change the team.");
    const d = data();
    if (d.profiles.some((x) => x.email.toLowerCase() === p.email.toLowerCase())) return fail("Someone with that email is already on the team.");
    const colours = ["#1d4ed8", "#15803d", "#be185d", "#c2410c", "#6d28d9", "#0e7490", "#a16207", "#b91c1c", "#4338ca", "#047857"];
    d.profiles.push({
      user_id: crypto.randomUUID(),
      display_name: p.name,
      email: p.email,
      phone: p.phone,
      role: p.role,
      colour: colours[d.profiles.length % colours.length],
      pay_rate: null,
      is_active: true,
    });
    return { ok: true, data: {} };
  }

  async signInLink(): Promise<Result<{ link: string }>> {
    return fail("Demo mode doesn't send sign-in links. Anyone can pick a person on the sign-in screen.");
  }

  async vehicles() {
    return this.me() ? clone(data().vehicles).sort((a, b) => a.name.localeCompare(b.name)) : [];
  }

  async saveVehicle(id: string | null, v: VehicleInput): Promise<Result> {
    if (!this.office()) return fail("You don't have permission to do that.");
    const d = data();
    if (d.vehicles.some((x) => x.name.toLowerCase() === v.name.toLowerCase() && x.id !== id)) return fail("That name is already in use.");
    if (id) {
      const x = d.vehicles.find((y) => y.id === id);
      if (!x) return fail("That vehicle couldn't be found.");
      Object.assign(x, v);
    } else {
      d.vehicles.push({ ...(v as Omit<Vehicle, "id">), id: crypto.randomUUID() });
    }
    return done;
  }

  async timeOff(from: string, to: string) {
    return clone(
      data().timeOff.filter((t) => t.starts_on <= to && t.ends_on >= from && (this.office() || (this.me() && t.user_id === this.userId))),
    ).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  }

  async addTimeOff(t: Omit<TimeOff, "id">): Promise<Result> {
    if (!(this.office() || (this.me() && t.user_id === this.userId))) return fail("You can only add your own time off.");
    data().timeOff.push({ ...t, id: crypto.randomUUID() });
    return done;
  }

  async deleteTimeOff(id: string): Promise<Result> {
    const d = data();
    const t = d.timeOff.find((x) => x.id === id);
    if (!t || !(this.office() || (this.me() && t.user_id === this.userId))) return fail("That time off couldn't be found.");
    d.timeOff = d.timeOff.filter((x) => x.id !== id);
    return done;
  }
}

export const demoStore = cache(async (): Promise<Store> => {
  const jar = await cookies();
  return new DemoStore(jar.get(DEMO_COOKIE)?.value ?? null);
});

export const demoPeople = () => clone(data().profiles.filter((p) => p.is_active));
