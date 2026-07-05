import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not set on the server." },
      { status: 500 },
    );
  }
  if (body?.password !== expected) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(GATE_COOKIE, await gateToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}
