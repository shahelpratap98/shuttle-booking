"use client";

import { useState } from "react";

// Phones: the extra filters stay folded away behind a button, so the list
// isn't pushed off the screen. Wider screens always show them in line.
export function MoreFilters({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(active);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn btn-quiet col-span-2 sm:hidden">
        {open ? "Fewer filters" : active ? "Filters (on)" : "More filters"}
      </button>
      <div className={`${open ? "grid" : "hidden"} col-span-2 grid-cols-2 gap-2 sm:contents`}>{children}</div>
    </>
  );
}
