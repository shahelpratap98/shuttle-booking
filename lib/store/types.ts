import type { Job, JobInput, JobMoney, JobQuery, JobStatus, PaymentMethod, Profile, Result, Role, Settings, TimeOff, Vehicle } from "@/lib/types";

export interface Customer {
  name: string;
  phone: string | null;
  email: string | null;
  key: string; // lib/customers.ts customerKey()
  bookings: number; // trips booked so far (not cancelled or enquiries)
  last: string | null; // latest pick-up date
}

export interface PersonPatch {
  display_name: string;
  phone: string | null;
  role: Role;
  colour: string;
  pay_rate: number | null;
  is_active: boolean;
}

export type VehicleInput = Omit<Vehicle, "id">;

// Everything the app reads and writes, always as the signed-in person.
// The live version runs under Supabase row-level security; the demo version
// applies the same rules in memory.
export interface Store {
  readonly mode: "live" | "demo";

  viewer(): Promise<Profile | null>;

  settings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Result>;

  jobs(q: JobQuery): Promise<Job[]>;
  job(id: string): Promise<Job | null>;
  saveJob(id: string | null, input: JobInput, money: JobMoney | null): Promise<Result<string>>;
  assignJob(id: string, driverId: string | null, vehicleId: string | null): Promise<Result>;
  setJobStatus(id: string, status: JobStatus): Promise<Result>;
  deleteJob(id: string): Promise<Result>;
  driverUpdateJob(id: string, status: JobStatus, driverNotes: string | null, distanceKm: number | null, collectedVia: PaymentMethod | null): Promise<Result>;
  recentCustomers(): Promise<Customer[]>;
  // For each job id the viewer may see: how many bookings that customer made
  // before it (0 = first time). Missing ids mean "not known".
  repeatCounts(ids: string[]): Promise<Record<string, number>>;

  // The usual weekly target for total booking $ (office only; null = none).
  weeklyTarget(): Promise<number | null>;
  saveWeeklyTarget(amount: number | null): Promise<Result>;

  people(): Promise<Profile[]>;
  savePerson(userId: string, patch: PersonPatch): Promise<Result>;
  invitePerson(p: { name: string; email: string; role: Role; phone: string | null }): Promise<Result<{ link?: string }>>;
  signInLink(email: string): Promise<Result<{ link: string }>>;

  vehicles(): Promise<Vehicle[]>;
  saveVehicle(id: string | null, v: VehicleInput): Promise<Result>;

  timeOff(from: string, to: string): Promise<TimeOff[]>;
  addTimeOff(t: Omit<TimeOff, "id">): Promise<Result>;
  deleteTimeOff(id: string): Promise<Result>;
}
