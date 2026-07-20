import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/gate" || pathname === "/api/gate") {
    return NextResponse.next();
  }

  const token = request.cookies.get(GATE_COOKIE)?.value;
  if (token && token === (await gateToken())) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // PWA assets stay public: the phone fetches the manifest, icons and the
  // service worker outside of any session, so gating them would break
  // "Add to Home Screen" and the offline fallback. None of them expose data.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js|offline).*)",
  ],
};
