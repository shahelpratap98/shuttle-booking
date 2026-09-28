import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const { viewer, store } = await requireViewer();
  return (
    <>
      <PageHeader title="My account" />
      <section className="card mb-4 max-w-xl p-4 text-sm">
        <p className="text-[17px] font-bold">{viewer.display_name}</p>
        <p className="text-muted">{viewer.email} · {ROLE_LABEL[viewer.role]}</p>
        <p className="mt-2 text-muted">To change your name, phone or calendar colour, ask the owner.</p>
      </section>
      <section className="card max-w-xl p-4">
        <h2 className="mb-3 font-bold">Change password</h2>
        {store.mode === "demo" ? <p className="text-sm text-muted">Demo mode has no passwords.</p> : <PasswordForm />}
      </section>
    </>
  );
}
