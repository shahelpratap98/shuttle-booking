import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { bookingRef, shareLabel } from "@/lib/format";
import { jobFormLists } from "../../form-data";
import { JobForm } from "../../job-form";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireOffice();
  const { id } = await params;
  const [job, lists] = await Promise.all([store.job(id), jobFormLists(store)]);
  if (!job) notFound();

  return (
    <>
      <PageHeader title={`Edit ${bookingRef(job)}`} />
      <JobForm
        job={job}
        defaults={job}
        people={lists.people}
        vehicles={lists.vehicles}
        customers={lists.customers}
        places={lists.places}
        currency={lists.settings.currency}
        shareName={shareLabel(lists.settings.business_name)}
        today={lists.today}
      />
    </>
  );
}
