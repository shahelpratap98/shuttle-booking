"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ActionSubmit, LinkPending } from "@/components/pending-buttons";

export type NavItem = { href: string; label: string; short?: string; badge?: number };

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

// Desktop: a row of links in the top bar.
export function NavLinks({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mx-1 flex max-w-full min-w-0 items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {link.label}
            <LinkPending />
            {link.badge ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-[#1b1300]">{link.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

// Phones: a fixed bottom bar with the most-used pages and a "More" sheet.
export function MobileNav({
  primary,
  more,
  name,
  roleLabel,
  signOut,
}: {
  primary: NavItem[];
  more: NavItem[];
  name: string;
  roleLabel: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  // Open "for this page": navigating away closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (o: boolean) => setOpenAt(o ? pathname : null);
  const moreActive = more.some((l) => isActive(pathname, l.href));
  const moreBadge = more.reduce((s, l) => s + (l.badge ?? 0), 0);

  const Item = ({ link }: { link: NavItem }) => {
    const active = isActive(pathname, link.href);
    return (
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-2 text-[11px] leading-tight font-semibold ${active ? "text-white" : "text-white/65"}`}
      >
        <span className={`h-1 w-8 rounded-full ${active ? "bg-accent" : "bg-transparent"}`} aria-hidden="true" />
        <span className="truncate">{link.short ?? link.label}</span>
        {link.badge ? <span className="absolute top-1.5 right-[18%] rounded-full bg-accent px-1.5 text-[10px] text-[#1b1300]">{link.badge}</span> : null}
        <span className="absolute top-1 right-1"><LinkPending className="size-3" /></span>
      </Link>
    );
  };

  return (
    <div className="sm:hidden print:hidden">
      {open ? (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            ref={(el) => el?.focus()}
            className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-t-2xl bg-surface p-3 shadow-2xl outline-none"
          >
            <p className="px-2 pb-2 text-sm text-muted">
              <span className="font-semibold text-text">{name}</span> · {roleLabel}
            </p>
            <ul className="divide-y divide-line">
              {more.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={`flex min-h-12 items-center justify-between px-2 text-[15px] font-semibold ${isActive(pathname, l.href) ? "text-accent-text" : "text-text"}`}>
                    <span className="inline-flex items-center gap-2">{l.label} <LinkPending /></span>
                    {l.badge ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-[#1b1300]">{l.badge}</span> : null}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/account" className="flex min-h-12 items-center px-2 text-[15px] font-semibold text-text">My account <LinkPending className="ml-2 size-4" /></Link>
              </li>
              <li>
                <form action={signOut}>
                  <ActionSubmit pendingLabel="Signing out…" className="min-h-12 w-full px-2 text-left text-[15px] font-semibold text-bad">Sign out</ActionSubmit>
                </form>
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-ink pb-[env(safe-area-inset-bottom)] text-white">
        {primary.map((l) => <Item key={l.href} link={l} />)}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-2 text-[11px] leading-tight font-semibold ${open || moreActive ? "text-white" : "text-white/65"}`}
        >
          <span className={`h-1 w-8 rounded-full ${moreActive && !open ? "bg-accent" : "bg-transparent"}`} aria-hidden="true" />
          <span>{open ? "Close" : "More"}</span>
          {moreBadge ? <span className="absolute top-1.5 right-[18%] rounded-full bg-accent px-1.5 text-[10px] text-[#1b1300]">{moreBadge}</span> : null}
        </button>
      </nav>
    </div>
  );
}
