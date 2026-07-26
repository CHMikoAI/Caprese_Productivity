// Transcribe a captured voice note via the OpenAI Whisper API.
//
// The OpenAI key lives ONLY here, as the Supabase Edge Function secret
// OPENAI_API_KEY — never in the frontend or the Next.js server. The Next.js
// route handler (/api/thoughts/transcribe) is the only caller; it authenticates
// with the project's service-role key (verify_jwt stays on).
//
// The request body is the raw audio blob; its Content-Type tells us the codec.
// OpenAI infers the decoder from the uploaded file's extension, so we name the
// file to match (webm for Chrome/Android opus, mp4/m4a for iOS Safari).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map an incoming audio MIME type to a filename OpenAI will accept. Whisper
// supports: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
function fileNameFor(contentType: string): string {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const ext: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/aac": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return `audio.${ext[type] ?? "webm"}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY is not configured." }, 500);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "audio/webm";
    const audio = await req.arrayBuffer();
    if (audio.byteLength === 0) {
      return json({ error: "Empty audio." }, 400);
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([audio], { type: contentType.split(";")[0].trim() }),
      fileNameFor(contentType),
    );
    form.append("model", "whisper-1");
    // The user thinks and speaks German; a language hint improves accuracy.
    form.append("language", "de");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("OpenAI transcription failed:", res.status, detail);
      return json({ error: "Transcription failed." }, 502);
    }

    const data = (await res.json()) as { text?: string };
    return json({ text: (data.text ?? "").trim() });
  } catch (err) {
    console.error("transcribe-thought error:", err);
    return json({ error: "Could not transcribe the audio." }, 500);
  }
});
