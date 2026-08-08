"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, Lightbulb, Loader2, Mic, Square, X } from "lucide-react";
import { createThought } from "@/app/actions";
import RichTextEditor from "@/components/RichTextEditor";
import Toast, { useToast } from "@/components/Toast";
import type { ThoughtSource } from "@/lib/types";

type Mode = "idle" | "recording" | "transcribing" | "draft";

/** Pick the best audio MIME type this browser can record (Safari → mp4, others → webm). */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Visible text of an HTML string — used to tell an empty editor from real content. */
function htmlText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

/**
 * Floating capture button, mounted globally so it overlays every tab. A tap
 * immediately starts an audio recording (with a live level meter); a clearly
 * visible "Text" button drops to a rich-text field instantly (no wait, no
 * network) for when speaking is awkward. Voice notes are transcribed via
 * /api/thoughts/transcribe and shown for a quick review before saving. Both
 * paths write to the thoughts inbox.
 */
export default function CaptureFab() {
  const router = useRouter();
  const { message: toast, show: showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [draftSource, setDraftSource] = useState<ThoughtSource>("voice");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const stopIntentRef = useRef<"transcribe" | "discard">("discard");
  const timerRef = useRef<number | undefined>(undefined);

  // Web Audio graph driving the live waveform while recording.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const teardownAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* already closed */
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setMode("transcribing");
    try {
      const res = await fetch("/api/thoughts/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "failed");
      setDraftSource("voice");
      setText(data.text ?? "");
      setNotice(
        data.text?.trim() ? null : "Nothing was transcribed — type it in.",
      );
      setMode("draft");
    } catch {
      // Never drop a capture: fall back to an editable field with the error.
      setDraftSource("voice");
      setText("");
      setNotice("Transcription failed — type your thought or record again.");
      setMode("draft");
    }
  }, []);

  const beginVoice = useCallback(async () => {
    setNotice(null);
    setText("");
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setDraftSource("text");
      setNotice("Recording isn't supported here — type your thought instead.");
      setMode("draft");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Live level meter (best-effort — never block recording if it fails).
      try {
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        void ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        /* no visualizer, recording still works */
      }

      const preferred = pickMimeType();
      const rec = new MediaRecorder(
        stream,
        preferred ? { mimeType: preferred } : undefined,
      );
      mimeRef.current = rec.mimeType || preferred || "audio/webm";
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stopTracks();
        stopTimer();
        teardownAudio();
        if (stopIntentRef.current === "discard") return;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        if (blob.size === 0) {
          setDraftSource("voice");
          setNotice("Nothing was recorded — type your thought instead.");
          setMode("draft");
          return;
        }
        void transcribe(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setMode("recording");
      stopTimer();
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      );
    } catch {
      stopTracks();
      teardownAudio();
      setDraftSource("text");
      setNotice("Microphone unavailable — type your thought instead.");
      setMode("draft");
    }
  }, [stopTracks, stopTimer, teardownAudio, transcribe]);

  function openCapture() {
    setOpen(true);
    void beginVoice();
  }

  // Switch to typing: abort the recording (discard audio) with zero delay.
  function switchToText() {
    stopIntentRef.current = "discard";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    stopTracks();
    stopTimer();
    teardownAudio();
    setDraftSource("text");
    setText("");
    setNotice(null);
    setMode("draft");
  }

  function stopRecording() {
    stopIntentRef.current = "transcribe";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      setMode("draft");
    }
  }

  const close = useCallback(() => {
    stopIntentRef.current = "discard";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    stopTracks();
    stopTimer();
    teardownAudio();
    setOpen(false);
    setMode("idle");
    setText("");
    setNotice(null);
    setSeconds(0);
    setBusy(false);
  }, [stopTracks, stopTimer, teardownAudio]);

  async function save() {
    if (busy || !htmlText(text).trim()) return;
    setBusy(true);
    try {
      await createThought(text, draftSource);
      close();
      router.refresh();
      showToast("Thought captured");
    } catch {
      setNotice("Could not save — try again.");
      setBusy(false);
    }
  }

  // Drive the waveform while recording; stop drawing when the view changes.
  useEffect(() => {
    if (mode !== "recording") return;
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const W = canvas.width;
    const H = canvas.height;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = data.length;
    const bw = W / bars;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx2.clearRect(0, 0, W, H);
      ctx2.fillStyle = "#e63946";
      for (let i = 0; i < bars; i++) {
        const v = data[i] / 255;
        const h = Math.max(3, v * H);
        const x = i * bw;
        const y = (H - h) / 2;
        ctx2.fillRect(x + bw * 0.2, y, bw * 0.6, h);
      }
    };
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  // Clean up any live capture on unmount.
  useEffect(() => () => close(), [close]);

  return (
    <>
      <button
        onClick={openCapture}
        aria-label="Capture a thought"
        className="fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95 desk:right-6 desk:bottom-6"
      >
        <Lightbulb className="h-6 w-6" strokeWidth={2.2} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={close}
        >
          <div
            className="w-full animate-sheet-up rounded-t-2xl bg-neutral-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:w-full sm:max-w-md sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                {mode === "recording"
                  ? "Recording…"
                  : mode === "transcribing"
                    ? "Transcribing…"
                    : draftSource === "voice"
                      ? "Review transcript"
                      : "New thought"}
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Recording */}
            {mode === "recording" && (
              <div className="mt-5 flex flex-col items-center gap-5">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-neutral-100">
                    {formatDuration(seconds)}
                  </span>
                </div>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={96}
                  className="h-16 w-full rounded-xl bg-neutral-950"
                  aria-hidden
                />
                <div className="flex w-full items-center gap-3">
                  <button
                    onClick={switchToText}
                    className="btn-plain flex-1 py-3"
                  >
                    <Keyboard className="h-4 w-4" />
                    Text
                  </button>
                  <button
                    onClick={stopRecording}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* Transcribing */}
            {mode === "transcribing" && (
              <div className="mt-6 flex flex-col items-center gap-3 py-4 text-neutral-400">
                <Loader2 className="h-7 w-7 animate-spin text-accent" />
                <p className="text-sm">Transcribing your note…</p>
              </div>
            )}

            {/* Draft (review transcript or plain text) */}
            {mode === "draft" && (
              <div
                className="mt-4"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
              >
                {notice && (
                  <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    {notice}
                  </p>
                )}
                <RichTextEditor
                  key={draftSource}
                  value={text}
                  onChange={setText}
                  placeholder="What's on your mind?"
                />
                <div className="mt-3 flex items-center gap-2">
                  {draftSource === "voice" && (
                    <button
                      onClick={beginVoice}
                      className="btn-plain px-3 py-2"
                    >
                      <Mic className="h-4 w-4" />
                      Record again
                    </button>
                  )}
                  <button
                    onClick={save}
                    disabled={busy || !htmlText(text).trim()}
                    className="ml-auto rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}
