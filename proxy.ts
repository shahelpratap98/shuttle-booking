import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hit, ipFrom } from "@/lib/rate-limit";

// Pages that work without a session.
const PUBLIC_PATHS = ["/login", "/reset", "/auth"];

// Flood protection, per IP, per server instance. Normal use is a few requests
// a minute; these only bite scripts and runaway clients.
const WINDOW = 60; // seconds
const MAX_REQUESTS = 300;
const MAX_WRITES = 60;
const MAX_AUTH_WRITES = 20;

function tooMany(retryAfter: number) {
  return new NextResponse("Too many requests. Wait a minute and try again.", {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // 1. rate limits, before any work is done
  const ip = ipFrom(request.headers);
  const all = hit(`all:${ip}`, MAX_REQUESTS, WINDOW);
  if (!all.ok) return tooMany(all.retryAfter);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const writes = hit(`write:${ip}`, MAX_WRITES, WINDOW);
    if (!writes.ok) return tooMany(writes.retryAfter);
    if (isPublic) {
      const auth = hit(`auth:${ip}`, MAX_AUTH_WRITES, WINDOW);
      if (!auth.ok) return tooMany(auth.retryAfter);
    }
  }

  // 2. who is signed in. Authorisation itself is enforced by row-level
  //    security in the database (or the demo store), not here.
  let response = NextResponse.next({ request });
  let signedIn: boolean;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    signedIn = Boolean(request.cookies.get("demo_user")?.value);
  } else {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // getClaims() checks the token's signature locally and refreshes an
    // expired session; no network round trip on every request.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    if (pathname !== "/") to.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }

  // Already signed in: skip the sign-in page (unless it's showing a notice,
  // e.g. "this account has been deactivated").
  if (signedIn && pathname === "/login" && !request.nextUrl.searchParams.has("error")) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  // everything except Next's own files, the icons and the app manifest
  // (phones fetch these before anyone signs in)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-icon|manifest.webmanifest).*)"],
};
