import { NO_DRIVER, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/constants";
import type { JobStatus, PaymentStatus } from "@/lib/types";

const STATUS_TONE: Record<JobStatus, string> = {
  enquiry: "bg-warn-bg text-warn",
  confirmed: "bg-info-bg text-info",
  completed: "bg-ok-bg text-ok",
  cancelled: "bg-idle-bg text-idle line-through decoration-1",
  no_show: "bg-bad-bg text-bad",
};

export function StatusChip({ status }: { status: JobStatus }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const PAY_TONE: Record<PaymentStatus, string> = {
  unpaid: "bg-warn-bg text-warn",
  pay_on_day: "bg-info-bg text-info",
  invoiced: "bg-idle-bg text-idle",
  paid: "bg-ok-bg text-ok",
};

export function PaymentChip({ status }: { status: PaymentStatus }) {
  return <span className={`chip ${PAY_TONE[status]}`}>{PAYMENT_LABEL[status]}</span>;
}

// A person's calendar colour beside their name, so identity never rests on colour alone.
export function PersonDot({ colour, className = "size-2.5" }: { colour: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: colour }} />;
}

export function Unassigned() {
  return <span className="chip border border-dashed border-warn/60 bg-warn-bg text-warn">{NO_DRIVER}</span>;
}
