import Link from "next/link";
import { signOut } from "@/app/auth-actions";
import { MobileNav, NavLinks, type NavItem } from "@/components/nav";
import { ActionSubmit } from "@/components/pending-buttons";
import { isOffice, isOwner, requireViewer } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { todayIn } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, store } = await requireViewer();
  const settings = await store.settings();
  const office = isOffice(viewer.role);

  // Upcoming jobs nobody has been given yet: the owner's to-do list.
  let available = 0;
  if (office) {
    const open = await store.jobs({ from: todayIn(settings.timezone), unassigned: true, statuses: ["confirmed", "enquiry"] });
    available = open.length;
  }

  const links: NavItem[] = office
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/jobs", label: "Bookings", badge: available },
        { href: "/totals", label: "Totals" },
        { href: "/driver-pay", label: "Driver pay" },
        { href: "/invoices", label: "Invoices" },
        { href: "/leads", label: "Leads" },
        { href: "/costs", label: "Costs" },
        { href: "/calendar", label: "Calendar" },
        { href: "/time-off", label: "Time off" },
        { href: "/vehicles", label: "Vehicles" },
        ...(isOwner(viewer.role) ? [{ href: "/team", label: "Team" }, { href: "/settings", label: "Settings" }] : []),
        { href: "/guide", label: "Help" },
      ]
    : [
        { href: "/my-jobs", label: "My jobs" },
        { href: "/calendar", label: "Calendar" },
        { href: "/time-off", label: "Time off" },
        { href: "/guide", label: "Help" },
      ];

  const primaryHrefs = office ? ["/dashboard", "/jobs", "/calendar"] : ["/my-jobs", "/calendar", "/time-off"];
  const primary = primaryHrefs.map((h) => links.find((l) => l.href === h)!);
  const more = links.filter((l) => !primaryHrefs.includes(l.href));

  return (
    <div className="min-h-screen">
      {store.mode === "demo" ? (
        <p className="bg-accent px-4 py-1.5 text-center text-[13px] font-semibold text-[#1b1300] print:hidden">
          Demo mode: sample data, reset whenever the server restarts. Connect Supabase to go live (see README).
        </p>
      ) : null}
      <header className="bg-ink text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:justify-start sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
            <span className="text-[15px] font-bold tracking-tight">{settings.business_name}</span>
          </Link>
          <div className="hidden sm:contents">
            <NavLinks links={links} />
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/80 sm:hidden">{viewer.display_name.split(" ")[0]}</span>
          <div className="ml-auto hidden items-center gap-4 text-sm sm:flex">
            <Link href="/account" className="text-white/80 underline-offset-4 hover:text-white hover:underline">
              {viewer.display_name}
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">{ROLE_LABEL[viewer.role]}</span>
            </Link>
            <form action={signOut}>
              <ActionSubmit pendingLabel="Signing out…" className="inline-flex items-center gap-2 font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
                Sign out
              </ActionSubmit>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 print:max-w-none print:p-0">{children}</main>
      <MobileNav primary={primary} more={more} name={viewer.display_name} roleLabel={ROLE_LABEL[viewer.role]} signOut={signOut} />
    </div>
  );
}
