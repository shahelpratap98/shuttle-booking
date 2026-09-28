import "server-only";
import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

// No Supabase project configured -> demo mode with sample data.
export const isDemo = () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function getStore(): Promise<Store> {
  return isDemo() ? demoStore() : supabaseStore();
}

export type { Store } from "./types";
