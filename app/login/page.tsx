import type { Metadata } from "next";
import Link from "next/link";
import { demoSignIn } from "@/app/auth-actions";
import { AuthCard, FormMessage } from "@/components/auth-card";
import { PersonDot } from "@/components/chips";
import { ActionSubmit } from "@/components/pending-buttons";
import { ROLE_LABEL } from "@/lib/constants";
import { isDemo } from "@/lib/store";
import { demoPeople } from "@/lib/store/demo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  inactive: "This account has been deactivated. Talk to the owner if that's a mistake.",
  noprofile: "Your login isn't linked to anyone on the team. Talk to the owner.",
  link: "That link has expired or was already used. Ask the owner for a new one, or reset your password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;

  if (isDemo()) {
    const people = demoPeople();
    return (
      <AuthCard title="Try the demo" intro="No database is connected, so this runs on sample data. Pick who you want to be.">
        {notice ? <div className="mb-4"><FormMessage tone="error">{notice}</FormMessage></div> : null}
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.user_id}>
              <form action={demoSignIn}>
                <input type="hidden" name="user_id" value={p.user_id} />
                <input type="hidden" name="next" value={next} />
                <ActionSubmit
                  pendingLabel="Signing in…"
                  className="flex w-full items-center gap-3 rounded-lg border border-line-2 px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-70"
                >
                  <PersonDot colour={p.colour} className="size-3" />
                  <span className="font-semibold">{p.display_name}</span>
                  <span className="ml-auto text-sm text-muted">{ROLE_LABEL[p.role]}</span>
                </ActionSubmit>
              </form>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Owner and Office see everything, including prices and costs. Drivers see only their own jobs.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in" intro="Bookings, dispatch and the team calendar.">
      <LoginForm next={next} notice={notice} />
      <p className="mt-5 text-sm text-muted">
        <Link href="/reset" className="link">Forgot your password?</Link>
      </p>
    </AuthCard>
  );
}
