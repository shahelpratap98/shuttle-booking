import { redirect } from "next/navigation";
import { homeFor, requireViewer } from "@/lib/auth";

export default async function Home() {
  const { viewer } = await requireViewer();
  redirect(homeFor(viewer.role));
}
