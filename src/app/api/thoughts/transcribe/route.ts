import { NextResponse, type NextRequest } from "next/server";

// PIN-gated proxy (src/proxy.ts covers /api/*) to the Supabase Edge Function
// that transcribes voice notes. Forwarding server-side keeps every Supabase key
// out of the browser and the OpenAI key out of Next entirely — it lives only as
// the edge function's secret. The audio blob is streamed through untouched.
export async function POST(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "audio/webm";
  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "Empty audio." }, { status: 400 });
  }

  try {
    const res = await fetch(`${url}/functions/v1/transcribe-thought`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
      },
      body: audio,
    });
    const data = await res.json().catch(() => ({ error: "Bad response." }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("transcribe proxy error:", err);
    return NextResponse.json(
      { error: "Could not reach the transcription service." },
      { status: 502 },
    );
  }
}
