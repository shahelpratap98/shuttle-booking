"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice, requireOwner } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { hit, waitMessage } from "@/lib/rate-limit";
import { isDemo } from "@/lib/store";
import { removeSampleData } from "@/lib/store/demo";
import type { Role } from "@/lib/types";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const checked = (fd: FormData, name: string) => fd.get(name) === "on";

function numberOrNull(fd: FormData, name: string, label: string, min: number, max: number): number | null | string {
  const raw = text(fd, name).replace(/[$,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return n;
}

// ------------------------------------------------------------------ target

export async function saveTarget(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOwner();
  const amount = numberOrNull(fd, "weekly_target", "The weekly target", 0, 10_000_000);
  if (typeof amount === "string") return { ok: false, message: amount };
  const res = await store.saveWeeklyTarget(amount === 0 ? null : amount);
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: amount ? "Target saved." : "Target cleared." };
}

// ------------------------------------------------------------------ team

export async function invitePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { viewer, store } = await requireOwner();
  const limit = hit(`invite:${viewer.user_id}`, 30, 60 * 60);
  if (!limit.ok) return { ok: false, message: "That's a lot of invites in one go. " + waitMessage(limit.retryAfter) };
  const name = text(fd, "display_name").slice(0, 80);
  const email = text(fd, "email").toLowerCase();
  const role = text(fd, "role") as Role;
  if (!name) return { ok: false, message: "Enter their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { ok: false, message: "Pick a role." };

  const res = await store.invitePerson({ name, email, role, phone: text(fd, "phone").slice(0, 40) || null });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/team");
  return res.data.link
    ? { ok: true, message: `${name} is set up. Send them this one-time link (text, WhatsApp or email) to choose a password:`, link: res.data.link }
    : { ok: true, message: `${name} is set up.` };
}

export async function sendSignInLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { viewer, store } = await requireOwner();
  const limit = hit(`invite:${viewer.user_id}`, 30, 60 * 60);
  if (!limit.ok) return { ok: false, message: "Too many links. " + waitMessage(limit.retryAfter) };
  const res = await store.signInLink(text(fd, "email"));
  if (!res.ok) return { ok: false, message: res.error };
  return { ok: true, message: "One-time link to set a new password. It works once and expires in an hour:", link: res.data.link };
}

export async function savePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { viewer, store } = await requireOwner();
  const userId = text(fd, "user_id");
  const name = text(fd, "display_name").slice(0, 80);
  const role = text(fd, "role") as Role;
  const colour = text(fd, "colour");
  const active = checked(fd, "is_active");
  const rate = numberOrNull(fd, "pay_rate", "Pay rate", 0, 1000);
  if (!name) return { ok: false, message: "Name can't be blank." };
  if (!ROLES.includes(role)) return { ok: false, message: "Pick a role." };
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) return { ok: false, message: "Pick a colour." };
  if (typeof rate === "string") return { ok: false, message: rate };
  if (userId === viewer.user_id && (role !== "owner" || !active)) {
    return { ok: false, message: "You can't remove your own owner access. Make someone else an owner first, then ask them." };
  }
  const res = await store.savePerson(userId, { display_name: name, phone: text(fd, "phone").slice(0, 40) || null, role, colour, pay_rate: rate, is_active: active });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

// ------------------------------------------------------------------ vehicles

export async function saveVehicle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const id = text(fd, "id") || null;
  const name = text(fd, "name").slice(0, 60);
  if (!name) return { ok: false, message: "Give the vehicle a name, e.g. Van 1." };
  const seats = numberOrNull(fd, "seats", "Seats", 1, 99);
  const cost = numberOrNull(fd, "cost_per_km", "Cost per km", 0, 50);
  if (typeof seats === "string") return { ok: false, message: seats };
  if (typeof cost === "string") return { ok: false, message: cost };
  const res = await store.saveVehicle(id, {
    name,
    registration: text(fd, "registration").toUpperCase().slice(0, 20) || null,
    seats: seats === null ? null : Math.round(seats),
    cost_per_km: cost,
    notes: text(fd, "notes").slice(0, 500) || null,
    is_active: id ? checked(fd, "is_active") : true,
  });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/vehicles");
  return { ok: true, message: id ? "Saved." : `${name} added.` };
}

// ------------------------------------------------------------------ settings

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOwner();
  const businessName = text(fd, "business_name").slice(0, 80);
  const currency = text(fd, "currency").toUpperCase();
  const timezone = text(fd, "timezone");
  if (!businessName) return { ok: false, message: "Enter the business name." };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: "Currency is a three-letter code, like NZD or AUD." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { ok: false, message: "That time zone isn't recognised. Use a name like Pacific/Auckland." };
  }
  const res = await store.saveSettings({ business_name: businessName, currency, timezone });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

// ------------------------------------------------------------------ demo

// Demo mode only: clear the made-up sample data, keeping imported and typed-in bookings.
export async function clearSampleData(): Promise<ActionState> {
  await requireOwner();
  if (!isDemo()) return { ok: false, message: "This only applies to demo mode." };
  const r = removeSampleData();
  revalidatePath("/", "layout");
  return { ok: true, message: `Removed ${r.bookingsRemoved} sample bookings and the sample team. ${r.bookingsKept} of your own bookings are left.` };
}
