import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-bold">Not found</h1>
        <p className="mt-2 text-muted">That job or page doesn&rsquo;t exist, or you don&rsquo;t have access to it.</p>
        <Link href="/" className="btn btn-primary mt-5">Go home</Link>
      </div>
    </main>
  );
}
