import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { isIsoDate, isTime } from "@/lib/dates";
import { jobRef } from "@/lib/format";
import type { Job } from "@/lib/types";
import { jobFormLists } from "../form-data";
import { JobForm } from "../job-form";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const lists = await jobFormLists(store);

  let defaults: Partial<Job> = {
    pickup_date: isIsoDate(s("date")) ? s("date") : lists.today,
    pickup_time: isTime(s("time")) ? s("time") : "",
    driver_id: s("driver") || null,
    status: "confirmed",
  };
  let title = "New job";
  let intro = "Everything a driver needs, plus what it earns and costs.";

  // Copy an existing job: a repeat of the same trip, or the return leg.
  const source = s("from") ? await store.job(s("from")) : null;
  if (source) {
    const isReturn = s("return") === "1";
    defaults = {
      ...source,
      pickup_date: isReturn ? source.pickup_date : defaults.pickup_date,
      pickup_time: "",
      pickup_address: isReturn ? source.dropoff_address : source.pickup_address,
      dropoff_address: isReturn ? source.pickup_address : source.dropoff_address,
      flight_no: null,
      driver_id: null,
      status: "confirmed",
      money: source.money ? { ...source.money, driver_cost: 0, fuel_cost: 0, tolls_parking: 0, other_cost: 0, payment_status: "unpaid" } : null,
    };
    title = isReturn ? `Return trip for ${jobRef(source.job_no)}` : `Copy of ${jobRef(source.job_no)}`;
    intro = isReturn ? "Addresses are swapped. Set the date and time of the return." : "Set the new date and time.";
  }

  return (
    <>
      <PageHeader title={title} intro={intro} />
      <JobForm
        defaults={defaults}
        people={lists.people}
        vehicles={lists.vehicles}
        customers={lists.customers}
        places={lists.places}
        currency={lists.settings.currency}
      />
    </>
  );
}
