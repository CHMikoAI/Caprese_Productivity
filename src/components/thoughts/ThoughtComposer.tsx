"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, Mic, Square } from "lucide-react";
import { createThought } from "@/app/actions";
import RichTextEditor from "@/components/RichTextEditor";
import Sheet from "@/components/Sheet";
import type { Category, Thought, ThoughtSource } from "@/lib/types";

type Mode = "recording" | "transcribing" | "draft";

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

function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Empty once tags are stripped? (an empty rich-text editor still yields markup) */
function htmlIsEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim() === "";
}

/**
 * The capture sheet for a new thought, opened from the Thoughts tab's header:
 * "New" starts on the text field, the microphone button starts recording at
 * once. Either way you can switch — type instead of speaking, or dictate
 * instead of typing. A voice note is transcribed via /api/thoughts/transcribe
 * and shown for a quick review before it is saved, and a capture is never
 * dropped: if the microphone or the transcription fails, the sheet falls back
 * to the text field and says why.
 */
export default function ThoughtComposer({
  startWith,
  categories,
  onSaved,
  onClose,
}: {
  startWith: ThoughtSource;
  categories: Category[];
  onSaved: (thought: Thought) => void;
  onClose: () => void;
}) {
  // The sheet is mounted fresh for every capture, so what it opens on can be
  // decided up front — no effect needed to get into the right mode.
  const [voiceOk] = useState(canRecord);
  const [mode, setMode] = useState<Mode>(
    startWith === "voice" && voiceOk ? "recording" : "draft",
  );
  const [draftSource, setDraftSource] = useState<ThoughtSource>(
    startWith === "voice" && voiceOk ? "voice" : "text",
  );
  const [notice, setNotice] = useState<string | null>(
    startWith === "voice" && !voiceOk
      ? "Recording isn't supported here — type your thought instead."
      : null,
  );
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [seconds, setSeconds] = useState(0);
  // True once the microphone is actually delivering audio.
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped to remount the editor with new content (a transcript, a clean slate).
  const [editorKey, setEditorKey] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const stopIntentRef = useRef<"transcribe" | "discard">("discard");
  const timerRef = useRef<number | undefined>(undefined);
  // Each recording attempt gets a number; a stale one (sheet closed, switched
  // to typing) recognises itself and backs out.
  const sessionRef = useRef(0);

  // Web Audio graph driving the live waveform while recording.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const releaseAudio = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* already closed */
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  /** Stop whatever is recording and throw the audio away. */
  const discardRecording = useCallback(() => {
    sessionRef.current += 1;
    stopIntentRef.current = "discard";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    releaseAudio();
  }, [releaseAudio]);

  const showDraft = useCallback(
    (source: ThoughtSource, content: string, message: string | null) => {
      setDraftSource(source);
      setText(content);
      setNotice(message);
      setLive(false);
      setEditorKey((k) => k + 1);
      setMode("draft");
    },
    [],
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
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
        const transcript = (data.text ?? "").trim();
        showDraft(
          "voice",
          transcript,
          transcript ? null : "Nothing was transcribed — type it in.",
        );
      } catch {
        // Never drop a capture: fall back to an editable field with the error.
        showDraft(
          "voice",
          "",
          "Transcription failed — type your thought or record again.",
        );
      }
    },
    [showDraft],
  );

  /** The microphone is ours: wire up the level meter and start recording. */
  const beginRecording = useCallback(
    (stream: MediaStream) => {
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
        releaseAudio();
        if (stopIntentRef.current === "discard") return;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        if (blob.size === 0) {
          showDraft("voice", "", "Nothing was recorded — type your thought instead.");
          return;
        }
        void transcribe(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setLive(true);
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      );
    },
    [releaseAudio, showDraft, transcribe],
  );

  /**
   * Ask for the microphone. Nothing changes until the permission prompt has
   * been answered: then recording starts — or, without a microphone, the sheet
   * falls back to typing.
   */
  const requestMicrophone = useCallback(() => {
    const session = ++sessionRef.current;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        if (session !== sessionRef.current) {
          // Closed or switched to typing while the prompt was up.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        try {
          beginRecording(stream);
        } catch {
          releaseAudio();
          showDraft("text", "", "Recording failed — type your thought instead.");
        }
      },
      () => {
        if (session !== sessionRef.current) return;
        releaseAudio();
        showDraft("text", "", "Microphone unavailable — type your thought instead.");
      },
    );
  }, [beginRecording, releaseAudio, showDraft]);

  // Opened on the microphone: ask for it straight away. Whatever is still
  // recording when the sheet goes away is discarded.
  useEffect(() => {
    if (startWith === "voice" && voiceOk) requestMicrophone();
    return discardRecording;
    // Runs once per sheet — the mode it opens on never changes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** From the draft: dictate (again) instead of typing. */
  function recordInstead() {
    setNotice(null);
    setSeconds(0);
    setLive(false);
    setMode("recording");
    requestMicrophone();
  }

  /** From the recording: abort it (discard the audio) and type instead. */
  function typeInstead() {
    discardRecording();
    showDraft("text", "", null);
  }

  function stopRecording() {
    stopIntentRef.current = "transcribe";
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      typeInstead();
    }
  }

  async function save() {
    if (busy || htmlIsEmpty(text)) return;
    setBusy(true);
    try {
      const thought = await createThought(text, draftSource, projectId || null);
      onSaved(thought);
    } catch {
      setNotice("Could not save — try again.");
      setBusy(false);
    }
  }

  // Drive the waveform while recording; stop drawing when the view changes.
  useEffect(() => {
    if (mode !== "recording" || !live) return;
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
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
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
    return () => cancelAnimationFrame(frame);
  }, [mode, live]);

  const empty = htmlIsEmpty(text);

  return (
    <Sheet
      title={
        mode === "recording"
          ? "Voice note"
          : mode === "transcribing"
            ? "Transcribing…"
            : draftSource === "voice"
              ? "Review transcript"
              : "New thought"
      }
      onClose={onClose}
      // A stray tap outside must not throw away words — only an empty draft
      // closes that way.
      dismissOnBackdrop={mode === "draft" && empty}
      footer={
        mode === "recording"
          ? () => (
              <>
                <button onClick={typeInstead} className="btn-plain flex-1 py-3">
                  <Keyboard className="h-4 w-4" />
                  Type instead
                </button>
                <button
                  onClick={stopRecording}
                  disabled={!live}
                  className="btn-primary flex-1 py-3"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop
                </button>
              </>
            )
          : mode === "draft"
            ? (close) => (
                <>
                  {voiceOk && (
                    <button
                      onClick={recordInstead}
                      className="btn-ghost -ml-2 px-2.5"
                      title="Discard this text and dictate instead"
                    >
                      <Mic className="h-4 w-4" />
                      {draftSource === "voice" ? "Record again" : "Record"}
                    </button>
                  )}
                  <div className="ml-auto flex gap-2">
                    <button onClick={close} className="btn-ghost">
                      Cancel
                    </button>
                    <button
                      onClick={save}
                      disabled={busy || empty}
                      className="btn-primary px-6"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </div>
                </>
              )
            : undefined
      }
    >
      {mode === "recording" && (
        <div className="flex flex-col items-center gap-5 pb-2 pt-3">
          <div className="flex items-center gap-3" aria-live="polite">
            {live ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                </span>
                <span className="text-2xl font-semibold tabular-nums text-neutral-50">
                  {formatDuration(seconds)}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-2.5 py-1 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for the microphone…
              </span>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={480}
            height={96}
            className="h-16 w-full rounded-xl bg-neutral-950"
            aria-hidden
          />
        </div>
      )}

      {mode === "transcribing" && (
        <div
          className="flex flex-col items-center gap-3 py-8 text-neutral-400"
          role="status"
        >
          <Loader2 className="h-7 w-7 animate-spin text-accent" />
          <p className="text-sm">Transcribing your note…</p>
        </div>
      )}

      {mode === "draft" && (
        <div
          className="flex flex-col gap-3 pt-0.5"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        >
          {notice && (
            <p
              role="status"
              className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-300"
            >
              {notice}
            </p>
          )}
          <RichTextEditor
            key={editorKey}
            value={text}
            onChange={setText}
            placeholder="What's on your mind?"
            autoFocus
          />
          {categories.length > 0 && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-neutral-500">
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="field"
              >
                <option value="">None — sort it later</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </Sheet>
  );
}
