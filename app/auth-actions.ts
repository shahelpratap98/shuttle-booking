"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hit, ipFrom, waitMessage } from "@/lib/rate-limit";
import { isDemo } from "@/lib/store";
import { DEMO_COOKIE, demoPeople } from "@/lib/store/demo";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

const MIN_PASSWORD = 10;

// Only same-site paths are allowed as a post-login destination.
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  // Stops password guessing: a few tries per account, a few more per network.
  const ip = ipFrom(await headers());
  const byEmail = hit(`signin:${email}`, 5, 15 * 60);
  const byIp = hit(`signin-ip:${ip}`, 20, 15 * 60);
  if (!byEmail.ok || !byIp.ok) return { error: "Too many sign-in attempts. " + waitMessage(Math.max(byEmail.retryAfter, byIp.retryAfter)) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[signIn]", error.code ?? error.status, error.message);
    if (error.code === "email_not_confirmed") return { error: "This account hasn't been confirmed yet. Ask the owner for a new sign-in link." };
    if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    return { error: "That email and password don't match. Try again, or reset your password." };
  }
  redirect(safeNext(formData.get("next")));
}

// Demo mode only: sign in as one of the sample people, no password.
export async function demoSignIn(formData: FormData) {
  if (!isDemo()) redirect("/login");
  const userId = String(formData.get("user_id") ?? "");
  if (!demoPeople().some((p) => p.user_id === userId)) redirect("/login");
  const jar = await cookies();
  jar.set(DEMO_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect(safeNext(formData.get("next")));
}

export async function requestReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter the email you sign in with." };

  const ip = ipFrom(await headers());
  const byEmail = hit(`reset:${email}`, 3, 60 * 60);
  const byIp = hit(`reset-ip:${ip}`, 10, 60 * 60);
  if (!byEmail.ok || !byIp.ok) return { error: "Too many reset requests. " + waitMessage(Math.max(byEmail.retryAfter, byIp.retryAfter)) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/set-password`,
  });
  if (error) console.error("[requestReset]", error.code ?? error.status, error.message);
  if (error?.status === 429) return { error: "A reset email was sent recently. Wait a minute before asking for another." };

  // Same answer whether or not the address exists.
  return { ok: "If that email has an account, a reset link is on its way. Check your inbox." };
}

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters. A short sentence works well.` };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "That link has expired. Ask the owner for a new one." };
  const limit = hit(`password:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return { error: "Too many attempts. " + waitMessage(limit.retryAfter) };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  if (isDemo()) {
    (await cookies()).delete(DEMO_COOKIE);
  } else {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
