import { BILLABLE } from "@/lib/constants";
import { addDays, minutesOf, timeFromMinutes, weekdayIndex } from "@/lib/dates";
import type { BookingSource, Job, JobStatus, Profile, ServiceType, Settings, TimeOff, Vehicle } from "@/lib/types";

// Sample data for demo mode: a small shuttle business with 26 weeks of
// history and two weeks of bookings ahead. Seeded, so it's the same every run.

export interface DemoData {
  settings: Settings;
  profiles: Profile[];
  vehicles: Vehicle[];
  jobs: Job[];
  timeOff: TimeOff[];
  nextJobNo: number;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const id = (prefix: string, i: number) => `${prefix}-0000-4000-8000-${String(i).padStart(12, "0")}`;

export const DEMO_PEOPLE: Profile[] = [
  { user_id: id("d0000001", 1), display_name: "Alex Morgan", email: "alex@example.com", phone: "021 555 0101", role: "owner", colour: "#1d4ed8", pay_rate: null, is_active: true },
  { user_id: id("d0000001", 2), display_name: "Priya Nair", email: "priya@example.com", phone: "021 555 0102", role: "dispatcher", colour: "#6d28d9", pay_rate: null, is_active: true },
  { user_id: id("d0000001", 3), display_name: "Tom Walker", email: "tom@example.com", phone: "021 555 0103", role: "driver", colour: "#15803d", pay_rate: 28, is_active: true },
  { user_id: id("d0000001", 4), display_name: "Mere Tane", email: "mere@example.com", phone: "021 555 0104", role: "driver", colour: "#be185d", pay_rate: 29.5, is_active: true },
  { user_id: id("d0000001", 5), display_name: "Jack Chen", email: "jack@example.com", phone: "021 555 0105", role: "driver", colour: "#c2410c", pay_rate: 27, is_active: true },
  { user_id: id("d0000001", 6), display_name: "Lisa Brown", email: "lisa@example.com", phone: "021 555 0106", role: "driver", colour: "#0e7490", pay_rate: 27, is_active: true },
];

const VEHICLES: Vehicle[] = [
  { id: id("d0000002", 1), name: "Van 1 · Hiace", registration: "SHT001", seats: 11, cost_per_km: 0.32, notes: null, is_active: true },
  { id: id("d0000002", 2), name: "Van 2 · Hiace", registration: "SHT002", seats: 11, cost_per_km: 0.32, notes: null, is_active: true },
  { id: id("d0000002", 3), name: "Minibus · Sprinter", registration: "SHT018", seats: 18, cost_per_km: 0.45, notes: "Trailer hitch", is_active: true },
  { id: id("d0000002", 4), name: "Car · Camry Hybrid", registration: "SHT004", seats: 4, cost_per_km: 0.18, notes: null, is_active: true },
];

const PLACES = [
  "Auckland Airport (AKL) Intl", "Auckland Airport (AKL) Domestic", "SkyCity Hotel, Victoria St", "Cordis Hotel, Symonds St",
  "Britomart Transport Centre", "Spark Arena", "Eden Park", "24 Ponsonby Rd, Ponsonby", "118 Remuera Rd, Remuera",
  "7 Hurstmere Rd, Takapuna", "15 Lake Rd, Devonport", "3 Queen St, CBD", "Viaduct Harbour", "Matakana Village",
  "Waiheke Ferry Terminal", "Hobbiton, Matamata", "45 Great South Rd, Epsom", "Newmarket Westfield", "Albany Mega Centre",
  "Kumeu Valley Estate", "Piha Beach", "12 Tamaki Dr, Mission Bay",
];
const AIRPORTS = PLACES.slice(0, 2);
const CUSTOMERS = [
  "Sarah Thompson", "James Wilson", "Aroha Ngata", "Michael Lee", "Emma Davis", "Rangi Parata", "Olivia Martin", "Daniel Kim",
  "Grace Patel", "Liam O'Connor", "Chloe Walker", "Wiremu Hohaia", "Sophie Anderson", "Noah Singh", "Isla Robinson",
  "Harbour Tech Ltd", "Kiwi Events Co", "Northshore Grammar", "Summit Law", "Blue Fern Travel", "Pacific Weddings",
];
const FLIGHTS = ["NZ102", "NZ8", "QF144", "JQ218", "NZ421", "EK448", "SQ285", "NZ5", "VA141", "NZ537"];

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}
function weighted<T>(r: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

const SERVICE_W: [ServiceType, number][] = [["airport", 50], ["corporate", 14], ["event", 10], ["tour", 8], ["school", 6], ["charter", 9], ["other", 3]];
const SOURCE_W: [BookingSource, number][] = [["phone", 28], ["website", 26], ["email", 14], ["repeat", 16], ["agent", 10], ["walk_in", 4], ["other", 2]];

export function seedDemo(today: string): DemoData {
  const r = rng(20260928);
  const drivers = DEMO_PEOPLE.filter((p) => p.role === "driver");
  const jobs: Job[] = [];
  // minutes each driver is busy, per day, for clash-free assignment
  const busy = new Map<string, [number, number][]>();
  let jobNo = 1001;

  const timeOff: TimeOff[] = [
    { id: id("d0000004", 1), user_id: drivers[1].user_id, starts_on: addDays(today, 3), ends_on: addDays(today, 5), note: "Family wedding" },
    { id: id("d0000004", 2), user_id: drivers[2].user_id, starts_on: addDays(today, 9), ends_on: addDays(today, 9), note: "Dentist" },
    { id: id("d0000004", 3), user_id: drivers[0].user_id, starts_on: addDays(today, -20), ends_on: addDays(today, -16), note: "Holiday" },
  ];
  const isOff = (driverId: string, d: string) => timeOff.some((t) => t.user_id === driverId && t.starts_on <= d && t.ends_on >= d);

  const start = addDays(today, -182);
  const end = addDays(today, 14);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = weekdayIndex(d);
    // Busier on Fridays and weekends; a step up in the last six weeks.
    const base = [4, 4, 5, 5, 7, 7, 6][wd];
    const trend = d > addDays(today, -42) ? 1.15 : 1;
    const count = Math.max(1, Math.round(base * trend + (r() * 3 - 1.2)));

    for (let k = 0; k < count; k++) {
      const service = weighted(r, SERVICE_W);
      const toAirport = r() < 0.5;
      const pickupAddress = service === "airport" ? (toAirport ? pick(r, PLACES.slice(2)) : pick(r, AIRPORTS)) : pick(r, PLACES.slice(2));
      let dropoffAddress = service === "airport" ? (toAirport ? pick(r, AIRPORTS) : pick(r, PLACES.slice(2))) : pick(r, PLACES.slice(2));
      if (dropoffAddress === pickupAddress) dropoffAddress = PLACES[(PLACES.indexOf(pickupAddress) + 3) % PLACES.length];

      const hour =
        service === "airport" ? weighted(r, [[4, 3], [5, 6], [6, 5], [7, 3], [9, 2], [11, 2], [13, 2], [15, 3], [17, 3], [19, 3], [21, 2]] as const)
        : service === "school" ? weighted(r, [[7, 5], [15, 5]] as const)
        : service === "event" ? weighted(r, [[11, 2], [14, 3], [17, 4], [22, 3]] as const)
        : weighted(r, [[8, 3], [9, 4], [10, 3], [12, 2], [14, 2], [16, 2], [18, 2]] as const);
      const time = timeFromMinutes(hour * 60 + pick(r, [0, 15, 30, 45]));

      const km = service === "tour" ? 60 + Math.round(r() * 120) : service === "charter" ? 25 + Math.round(r() * 60) : 12 + Math.round(r() * 38);
      const duration = service === "tour" ? 240 + pick(r, [0, 60, 120]) : service === "event" ? pick(r, [60, 90, 180, 240]) : Math.max(30, Math.round((20 + km * 1.3) / 15) * 15);
      const passengers = Math.max(1, Math.min(17, Math.round(service === "school" ? 8 + r() * 8 : service === "event" || service === "tour" ? 4 + r() * 10 : 1 + r() * 4)));

      const vehicle = passengers > 11 ? VEHICLES[2] : passengers <= 3 && r() < 0.5 ? VEHICLES[3] : pick(r, VEHICLES.slice(0, 2));

      const past = d < today;
      let status: JobStatus;
      if (past) status = weighted(r, [["completed", 90], ["cancelled", 6], ["no_show", 3]] as const);
      else status = weighted(r, [["confirmed", 88], ["enquiry", 8], ["cancelled", 4]] as const);

      // Assign a free driver. Past jobs all had one; about a quarter of
      // upcoming jobs are still open for the owner to allocate.
      let driverId: string | null = null;
      const leaveOpen = !past && (status === "enquiry" || r() < (daysAhead(today, d) <= 2 ? 0.12 : 0.3));
      if (!leaveOpen && status !== "cancelled") {
        const s = minutesOf(time);
        const e = s + duration + 20;
        for (const dr of shuffle(r, drivers)) {
          if (isOff(dr.user_id, d)) continue;
          const key = `${dr.user_id}|${d}`;
          const slots = busy.get(key) ?? [];
          if (slots.every(([a, b]) => e <= a || s >= b)) {
            slots.push([s, e]);
            busy.set(key, slots);
            driverId = dr.user_id;
            break;
          }
        }
      } else if (status === "cancelled" && r() < 0.5) {
        driverId = pick(r, drivers).user_id;
      }

      const driver = drivers.find((x) => x.user_id === driverId);
      const price = Math.round((service === "tour" ? 220 : service === "charter" ? 120 : 45) + km * 2.1 + passengers * 6 + (hour < 6 ? 15 : 0));
      const priceRounded = Math.round(price / 5) * 5;
      const billable = BILLABLE.includes(status);
      const driverCost = billable && driver ? round2(((duration + 15) / 60) * (driver.pay_rate ?? 27)) : 0;
      const fuel = billable ? round2(km * 1.6 * (vehicle.cost_per_km ?? 0.3)) : 0;
      const tolls = billable && r() < 0.25 ? pick(r, [2.3, 4.6, 8, 12]) : 0;
      const other = billable && r() < 0.06 ? pick(r, [10, 15, 25]) : 0;
      const paid =
        status === "completed" ? weighted(r, [["paid", 84], ["invoiced", 10], ["unpaid", 6]] as const)
        : status === "no_show" ? weighted(r, [["paid", 60], ["unpaid", 40]] as const)
        : status === "cancelled" ? "unpaid"
        : weighted(r, [["paid", 30], ["unpaid", 60], ["invoiced", 10]] as const);

      const customer = pick(r, CUSTOMERS);
      const lead = weighted(r, [[0, 8], [1, 18], [2, 14], [3, 10], [5, 10], [7, 12], [10, 8], [14, 10], [21, 6], [30, 4]] as const);
      const createdAt = new Date(Date.parse(addDays(d, -lead) + "T00:00:00Z") + Math.floor(r() * 10 + 8) * 3_600_000).toISOString();

      jobs.push({
        id: id("d0000003", jobNo),
        job_no: jobNo++,
        status,
        service_type: service,
        pickup_date: d,
        pickup_time: time,
        duration_min: duration,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        passengers,
        luggage: service === "airport" ? passengers + Math.floor(r() * 3) : 0,
        flight_no: service === "airport" ? pick(r, FLIGHTS) : null,
        customer_name: customer,
        customer_phone: `02${Math.floor(r() * 8) + 1} ${String(Math.floor(r() * 900) + 100)} ${String(Math.floor(r() * 9000) + 1000)}`,
        customer_email: /Ltd|Co|Grammar|Law|Travel|Weddings/.test(customer) ? null : `${customer.split(" ")[0].toLowerCase()}@example.com`,
        booking_source: weighted(r, SOURCE_W),
        driver_id: driverId,
        vehicle_id: status === "cancelled" || !driverId ? (r() < 0.4 ? vehicle.id : null) : vehicle.id,
        notes: r() < 0.12 ? pick(r, ["Child seat needed", "Meet at arrivals with name board", "Wheelchair user, needs ramp", "Return trip booked separately", "Pay driver cash"]) : null,
        driver_notes: status === "completed" && r() < 0.08 ? pick(r, ["Flight delayed 30 min", "Extra stop on the way", "Customer late 10 min"]) : null,
        distance_km: status === "completed" || status === "no_show" ? km : r() < 0.6 ? km : null,
        created_at: createdAt,
        completed_at: status === "completed" ? new Date(Date.parse(d + "T00:00:00Z") + (minutesOf(time) + duration) * 60_000).toISOString() : null,
        money: {
          price: status === "no_show" ? Math.round(priceRounded * 0.5) : priceRounded,
          driver_cost: driverCost,
          fuel_cost: fuel,
          tolls_parking: tolls,
          other_cost: other,
          payment_status: paid,
        },
      });
    }
  }


  return {
    settings: { business_name: "Demo Shuttles", currency: "NZD", timezone: "Pacific/Auckland" },
    profiles: DEMO_PEOPLE.map((p) => ({ ...p })),
    vehicles: VEHICLES.map((v) => ({ ...v })),
    jobs,
    timeOff,
    nextJobNo: jobNo,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const daysAhead = (today: string, d: string) => (Date.parse(d) - Date.parse(today)) / 86_400_000;
function shuffle<T>(r: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
