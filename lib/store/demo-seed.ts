import { BILLABLE } from "@/lib/constants";
import { addDays, minutesOf, timeFromMinutes, weekdayIndex } from "@/lib/dates";
import type { BookingSource, Job, JobMoney, JobStatus, LeadDay, Overhead, PaymentMethod, Profile, ServiceType, Settings, TimeOff, Vehicle } from "@/lib/types";
import { JOB_DEFAULTS, MONEY_DEFAULTS, VEHICLE_DEFAULTS } from "./defaults";

// Sample data for demo mode, shaped like Trekway's booking sheet: mostly
// Waikato and Bay of Plenty towns to and from Auckland airport in a Car or a
// Van, some cruise-ship days and tours, bookings from the website, WhatsApp,
// texts and Messenger, paid online or on the day. 26 weeks back, 4 months ahead.
// Seeded, so it's the same on every run. All names are made up.

export interface DemoData {
  settings: Settings;
  profiles: Profile[];
  vehicles: Vehicle[];
  jobs: Job[];
  timeOff: TimeOff[];
  nextJobNo: number;
  // Optional, so demo data saved before these existed still loads.
  weeklyTarget?: number | null;
  leadDays?: LeadDay[];
  overheads?: Overhead[];
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
  { user_id: id("d0000001", 3), display_name: "Tom Walker", email: "tom@example.com", phone: "021 555 0103", role: "driver", colour: "#15803d", pay_rate: null, is_active: true },
  { user_id: id("d0000001", 4), display_name: "Mere Tane", email: "mere@example.com", phone: "021 555 0104", role: "driver", colour: "#be185d", pay_rate: null, is_active: true },
  { user_id: id("d0000001", 5), display_name: "Jack Chen", email: "jack@example.com", phone: "021 555 0105", role: "driver", colour: "#c2410c", pay_rate: null, is_active: true },
];

const CAR: Vehicle = { id: id("d0000002", 1), name: "Car", registration: "TRK001", seats: 4, cost_per_km: null, notes: "Toyota Camry hybrid", is_active: true, ...VEHICLE_DEFAULTS };
const VAN: Vehicle = { id: id("d0000002", 2), name: "Van", registration: "TRK011", seats: 10, cost_per_km: null, notes: "Toyota Hiace", is_active: true, ...VEHICLE_DEFAULTS };

// Where customers live, how long a return run to Auckland airport ties a
// driver up, and the usual charge for one to two people.
const TOWNS = [
  { name: "Hamilton", streets: ["Delamare Road, Pukete", "Waterford Road, Fitzroy", "Grey Street, Hamilton East", "River Road, Flagstaff", "Tuhikaramea Road, Dinsdale"], minutes: 240, price: 200, weight: 34 },
  { name: "Cambridge", streets: ["Williams Street", "Victoria Street", "Thornton Road"], minutes: 270, price: 230, weight: 10 },
  { name: "Rotorua", streets: ["Brent Road, Owhata", "Fenton Street", "Monokia Street, Fairy Springs", "Lake Road", "Te Ngae Road"], minutes: 420, price: 400, weight: 20 },
  { name: "Tauranga", streets: ["Bethlehem Heights", "Cameron Road", "Devonport Road"], minutes: 420, price: 380, weight: 12 },
  { name: "Waihi", streets: ["Mackay Street", "Seddon Street"], minutes: 360, price: 320, weight: 6 },
  { name: "Matamata", streets: ["Broadway", "Firth Street"], minutes: 300, price: 280, weight: 6 },
  { name: "Te Awamutu", streets: ["Alexandra Street", "Bank Street"], minutes: 270, price: 230, weight: 6 },
  { name: "Auckland", streets: ["Wellesley Street West, CBD", "Quay Street, CBD", "Tidal Road, Mangere", "Killygordon Place, Massey", "King Richard Place, Browns Bay"], minutes: 90, price: 110, weight: 6 },
] as const;

const AIRPORT = ["Auckland International", "Auckland International", "Auckland International", "Auckland Domestic"] as const;
const FLIGHTS = ["NZ175", "QF143", "NZ128", "MH133", "KE411", "NZ196", "NZ176", "EK449", "SQ286", "JQ214", "VA147", "DL65"];
const FIRST = ["Fiona", "Raewyn", "Evelyn", "Colleen", "Alison", "Robert", "Michelle", "Sharon", "Kinal", "Jean", "Heewon", "Binny", "Manu", "Aroha", "Wiremu", "Priti", "Grant", "Denise", "Hemi", "Sione", "Megan", "Ravi", "Chloe", "Bruce"];
const LAST = ["Smith", "Hodge", "Patel", "Ngata", "Wilson", "Brown", "Kaur", "Tapsell", "Yoon", "Hutt", "Singh", "Te Aho", "Kerr", "Nguyen"];

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
const round10 = (x: number) => Math.round(x / 10) * 10;
const phone = (r: () => number) => `02${pick(r, ["1", "2", "7"])}${String(Math.floor(r() * 9_000_000) + 1_000_000)}`;
const compact = (d: string) => d.replaceAll("-", "");

type Draft = Omit<Job, "id" | "job_no" | "created_at" | "completed_at" | "driver_notes" | "collected_via" | "collect_amount" | "money" | "booking_source" | keyof typeof JOB_DEFAULTS> & {
  price: number;
  bookedOn: string;
  source: BookingSource;
};

export function seedDemo(today: string): DemoData {
  const r = rng(20260928);
  const owner = DEMO_PEOPLE[0];
  const drivers = DEMO_PEOPLE.filter((p) => p.role === "driver");
  const jobs: Job[] = [];
  const busy = new Map<string, [number, number][]>();
  let jobNo = 1001;
  const refCount = new Map<string, number>();

  const timeOff: TimeOff[] = [
    { id: id("d0000004", 1), user_id: drivers[1].user_id, starts_on: addDays(today, 3), ends_on: addDays(today, 5), note: "Family wedding" },
    { id: id("d0000004", 2), user_id: drivers[2].user_id, starts_on: addDays(today, 9), ends_on: addDays(today, 9), note: "Dentist" },
    { id: id("d0000004", 3), user_id: drivers[0].user_id, starts_on: addDays(today, -20), ends_on: addDays(today, -16), note: "Holiday" },
  ];
  const isOff = (driverId: string, d: string) => timeOff.some((t) => t.user_id === driverId && t.starts_on <= d && t.ends_on >= d);

  // A free driver for this slot, or null. The owner drives too (no driver pay).
  const findDriver = (d: string, time: string, minutes: number): Profile | null => {
    const s = minutesOf(time);
    const e = s + minutes + 30;
    const shuffled = [...drivers].sort(() => r() - 0.5);
    const order = r() < 0.3 ? [owner, ...shuffled] : [...shuffled, owner];
    for (const p of order) {
      if (isOff(p.user_id, d)) continue;
      const key = `${p.user_id}|${d}`;
      const slots = busy.get(key) ?? [];
      if (slots.every(([a, b]) => e <= a || s >= b)) {
        slots.push([s, e]);
        busy.set(key, slots);
        return p;
      }
    }
    return null;
  };

  const newRef = (bookedOn: string) => {
    const n = (refCount.get(bookedOn) ?? 0) + 1;
    refCount.set(bookedOn, n);
    return `TW-${compact(bookedOn)}-${String(n).padStart(3, "0")}`;
  };

  const add = (x: Draft, past: boolean): Job => {
    const d = x.pickup_date;
    let status: JobStatus = x.status;
    if (past && status === "confirmed") status = weighted(r, [["completed", 93], ["cancelled", 4], ["no_show", 3]] as const);
    if (!past && status === "confirmed" && r() < 0.05) status = "cancelled";

    // Payment, the way the sheet's "More Info" column reads.
    const prepaid = x.source === "website" ? r() < 0.85 : r() < 0.25;
    let payment_status: JobMoney["payment_status"] = prepaid ? "paid" : x.source === "agent" ? "invoiced" : "pay_on_day";
    let payment_method: PaymentMethod | null = prepaid ? (x.source === "website" ? "online" : "bank") : null;
    let paid_on: string | null = prepaid ? x.bookedOn : null;
    const collect = payment_status === "pay_on_day" ? x.price : 0;
    let collected_via: PaymentMethod | null = null;
    if (past && status === "completed" && payment_status === "pay_on_day") {
      collected_via = r() < 0.6 ? "cash" : "card";
      payment_status = "paid";
      payment_method = collected_via;
      paid_on = d;
    }
    if (status === "cancelled") payment_status = prepaid ? "paid" : "unpaid";

    const { price, bookedOn, source, ...fields } = x;
    const job: Job = {
      ...JOB_DEFAULTS,
      ...fields,
      booked_on: bookedOn,
      id: id("d0000003", jobNo),
      job_no: jobNo++,
      status,
      booking_source: source,
      collect_amount: status === "cancelled" ? 0 : collect,
      collected_via,
      driver_id: status === "cancelled" && r() < 0.5 ? null : x.driver_id,
      driver_pay: BILLABLE.includes(status) ? x.driver_pay : 0,
      driver_notes: status === "completed" && r() < 0.07 ? pick(r, ["Flight 40 min late", "Extra stop in Huntly", "Customer paid by card, receipt given"]) : null,
      created_at: new Date(Date.parse(bookedOn + "T00:00:00Z") + Math.floor(r() * 12 + 7) * 3_600_000).toISOString(),
      completed_at: status === "completed" ? new Date(Date.parse(d + "T00:00:00Z") + (minutesOf(x.pickup_time) + x.duration_min) * 60_000).toISOString() : null,
      money: { ...MONEY_DEFAULTS, price: status === "no_show" ? round10(price / 2) : price, fuel_cost: 0, tolls_parking: 0, other_cost: 0, payment_status, payment_method, paid_on },
    };
    jobs.push(job);
    return job;
  };

  const start = addDays(today, -182);
  const end = addDays(today, 120);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const past = d < today;
    const wd = weekdayIndex(d);
    // Fewer bookings the further ahead you look, like a real forward book.
    const ahead = Math.max(0, (Date.parse(d) - Date.parse(today)) / 86_400_000);
    const fill = ahead <= 7 ? 1 : ahead <= 21 ? 0.7 : ahead <= 35 ? 0.45 : ahead <= 60 ? 0.25 : 0.12;
    const base = [2, 2, 2, 2.5, 3.5, 3.5, 3][wd] * (d > addDays(today, -60) ? 1.15 : 1);
    const count = Math.max(0, Math.round((base + (r() * 2 - 1)) * fill));

    for (let k = 0; k < count; k++) {
      const service: ServiceType = weighted(r, [["airport", 84], ["cruise", 4], ["tour", 4], ["transfer", 6], ["event", 2]] as const);
      const town = weighted(r, TOWNS.map((t) => [t, t.weight] as const));
      const address = `${Math.floor(r() * 180) + 1} ${pick(r, town.streets)}, ${town.name}`;
      const pax = weighted(r, [[1, 30], [2, 35], [3, 12], [4, 10], [6, 6], [8, 4], [9, 3]] as const);
      const vehicle = pax > 4 ? VAN : CAR;
      const source: BookingSource = weighted(r, [["website", 40], ["whatsapp", 20], ["text", 12], ["messenger", 8], ["email", 8], ["phone", 6], ["repeat", 4], ["agent", 2]] as const);
      const bookedOn = addDays(d, -weighted(r, [[1, 8], [3, 12], [7, 18], [14, 20], [30, 20], [60, 14], [90, 8]] as const));

      let pickup: string, dropoff: string, hour: number;
      let minutes: number = town.minutes;
      let price = town.price + Math.max(0, pax - 2) * (town.minutes >= 400 ? 50 : 30) + (pax > 4 ? 60 : 0);
      let flight: string | null = null;
      if (service === "airport") {
        const toAirport = r() < 0.5;
        pickup = toAirport ? address : pick(r, AIRPORT);
        dropoff = toAirport ? pick(r, AIRPORT) : address;
        hour = toAirport
          ? weighted(r, [[1, 2], [3, 5], [4, 6], [5, 5], [9, 3], [12, 2], [15, 3], [17, 2]] as const)
          : weighted(r, [[6, 5], [8, 4], [10, 3], [14, 4], [17, 3], [20, 3], [22, 2]] as const);
        flight = pick(r, FLIGHTS);
      } else if (service === "cruise") {
        pickup = "Cruise ship terminal, Auckland Port";
        dropoff = r() < 0.5 ? "Rotorua day tour, back to the ship" : "Hobbiton, back to the ship";
        hour = 7;
        minutes = 720;
        price = 750;
      } else if (service === "tour") {
        pickup = address;
        dropoff = pick(r, ["Hobbiton Movie Set, Matamata", "Waitomo Caves", "Te Puia, Rotorua"]);
        hour = 8;
        minutes = 540;
        price = 450 + pax * 40;
      } else if (service === "transfer") {
        pickup = pick(r, ["Hotel Grand Chancellor, Wellesley Street", "DoubleTree Karaka", "Auckland Domestic", "Quest Henderson"]);
        dropoff = `${Math.floor(r() * 90) + 1} ${pick(r, TOWNS[7].streets)}, Auckland`;
        hour = weighted(r, [[9, 3], [12, 3], [16, 3], [19, 2]] as const);
        minutes = 90;
        price = 110 + pax * 15;
      } else {
        pickup = address;
        dropoff = pick(r, ["Waikato Stadium, Hamilton", "Claudelands Event Centre", "Hamilton Gardens"]);
        hour = 17;
        minutes = 300;
        price = 350;
      }
      price = round10(price);
      const time = timeFromMinutes(hour * 60 + pick(r, [0, 15, 30, 45]));

      const status: JobStatus = !past && r() < 0.06 ? "enquiry" : "confirmed";
      // Past jobs were all covered; about a third of future ones still say TBC.
      const leaveTbc = !past && (status === "enquiry" || r() < (ahead <= 3 ? 0.1 : 0.35));
      const driver = leaveTbc ? null : findDriver(d, time, minutes);
      const driverPay = !driver || driver.role === "owner" ? 0 : round10(price * (price >= 700 ? 0.4 : 0.45));

      const base: Draft = {
        booking_ref: source === "website" ? newRef(bookedOn) : null,
        status,
        service_type: service,
        pickup_date: d,
        pickup_time: time,
        duration_min: minutes,
        pickup_address: pickup,
        dropoff_address: dropoff,
        passengers: pax,
        luggage: service === "airport" ? pax + Math.floor(r() * 2) : 0,
        flight_no: flight,
        customer_name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
        customer_phone: phone(r),
        customer_email: source === "website" || source === "email" ? `customer${jobNo}@example.com` : null,
        driver_id: driver?.user_id ?? null,
        vehicle_id: vehicle.id,
        linked_job_id: null,
        is_shared: false,
        driver_pay: driverPay,
        notes: r() < 0.1 ? pick(r, ["Display name board at arrivals", "Child seat needed", "2 pickup addresses, see notes", "Large suitcase + golf bag"]) : null,
        distance_km: null,
        price,
        bookedOn,
        source,
      };
      const out = add(base, past);

      // Some airport bookings come with the return leg booked too.
      if (service === "airport" && r() < 0.22) {
        const backOn = addDays(d, weighted(r, [[3, 2], [7, 4], [10, 3], [14, 3], [21, 2]] as const));
        if (backOn <= end) {
          const backTime = timeFromMinutes(weighted(r, [[7, 3], [11, 2], [15, 3], [19, 3], [22, 1]] as const) * 60 + pick(r, [0, 30]));
          const backDriver = backOn >= today && r() < 0.4 ? null : findDriver(backOn, backTime, minutes);
          if (out.booking_ref) out.booking_ref += "-OUT";
          const ret = add(
            {
              ...base,
              booking_ref: out.booking_ref ? out.booking_ref.replace(/-OUT$/, "-RET") : null,
              pickup_date: backOn,
              pickup_time: backTime,
              pickup_address: base.dropoff_address,
              dropoff_address: base.pickup_address,
              flight_no: pick(r, FLIGHTS),
              driver_id: backDriver?.user_id ?? null,
              driver_pay: !backDriver || backDriver.role === "owner" ? 0 : driverPay,
              linked_job_id: out.id,
              status: "confirmed",
            },
            backOn < today,
          );
          out.linked_job_id = ret.id;
        }
      }

      // Now and then a van run is shared between two bookings, charge split.
      if (service === "airport" && vehicle === VAN && r() < 0.35 && out.driver_id && out.status !== "cancelled") {
        const half = round10(price / 2);
        out.is_shared = true;
        if (out.money) out.money.price = half;
        out.driver_pay = out.driver_pay ? round10(out.driver_pay / 2) : 0;
        if (out.collect_amount) out.collect_amount = half;
        const home = (a: string) => (a.startsWith("Auckland") ? a : `${Math.floor(r() * 180) + 1} ${pick(r, town.streets)}, ${town.name}`);
        add(
          {
            ...base,
            booking_ref: null,
            customer_name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
            customer_phone: phone(r),
            customer_email: null,
            pickup_address: home(base.pickup_address),
            dropoff_address: home(base.dropoff_address),
            driver_id: out.driver_id,
            is_shared: true,
            price: half,
            driver_pay: out.driver_pay,
            notes: "Shared van",
            source: "whatsapp",
          },
          past,
        );
      }
    }
  }

  return {
    settings: { business_name: "Trekway Shuttle", currency: "NZD", timezone: "Pacific/Auckland", gst_registered: true },
    profiles: DEMO_PEOPLE.map((p) => ({ ...p })),
    vehicles: [CAR, VAN].map((v) => ({ ...v })),
    jobs,
    timeOff,
    nextJobNo: jobNo,
  };
}
