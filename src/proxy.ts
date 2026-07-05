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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
