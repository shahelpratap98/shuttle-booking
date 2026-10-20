import { redirect } from "next/navigation";
import { requireOffice } from "@/lib/auth";

// The "Find booking" box in the header: a TW- reference, J-number, name or
// phone. One match opens that booking; otherwise the list of matches.
export default async function FindBooking({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const term = (typeof q.q === "string" ? q.q : "").trim().slice(0, 80);
  if (!term) redirect("/jobs?view=all");
  // "1158" is most likely J-1158: open it if it exists.
  if (/^\d{3,9}$/.test(term)) {
    const [byNumber] = await store.jobs({ search: `J-${term}`, limit: 1 });
    if (byNumber) redirect(`/jobs/${byNumber.id}`);
  }
  const found = await store.jobs({ search: term, order: "desc", limit: 2 });
  if (found.length === 1) redirect(`/jobs/${found[0].id}`);
  redirect(`/jobs?${new URLSearchParams({ view: "all", q: term })}`);
}
