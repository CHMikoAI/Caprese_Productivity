"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, RotateCcw } from "lucide-react";
import {
  assignThoughtProject,
  setThoughtArchived,
  updateThought,
} from "@/app/actions";
import RichTextEditor from "@/components/RichTextEditor";
import Toast, { useToast } from "@/components/Toast";
import { goalFrame, withAlpha } from "@/lib/colorContrast";
import { addDays, formatDMY, formatTime, isSameDay, startOfDay } from "@/lib/dates";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Category, Thought } from "@/lib/types";

type StatusFilter = "all" | "open" | "sorted";
type TimeFilter = "all" | "today" | "7d" | "30d";

const inputClass =
  "rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-200 focus:border-accent focus:outline-none sm:py-1.5 sm:text-xs";

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "sorted", label: "Sorted" },
];

/** Empty once tags are stripped? (an empty rich-text editor still yields markup) */
function htmlIsEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim() === "";
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return `Today, ${formatTime(d)}`;
  if (isSameDay(d, addDays(now, -1))) return `Yesterday, ${formatTime(d)}`;
  return formatDMY(d);
}

export default function ThoughtsView({
  initialThoughts,
  categories,
}: {
  initialThoughts: Thought[];
  categories: Category[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();

  // Sync from the server prop without an effect (derive during render).
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [prevInitial, setPrevInitial] = useState(initialThoughts);
  if (prevInitial !== initialThoughts) {
    setPrevInitial(initialThoughts);
    setThoughts(initialThoughts);
  }

  const [openCollapsed, setOpenCollapsed] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editProject, setEditProject] = useState("");

  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterTime, setFilterTime] = useState<TimeFilter>("all");

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const sorted = useMemo(
    () => [...thoughts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [thoughts],
  );
  const active = useMemo(() => sorted.filter((t) => !t.archived_at), [sorted]);
  // The Open inbox = active thoughts that haven't been given a project yet.
  const open = useMemo(
    () => active.filter((t) => !t.linked_project_id),
    [active],
  );
  const archived = useMemo(() => sorted.filter((t) => t.archived_at), [sorted]);

  const filtered = useMemo(() => {
    const cutoff =
      filterTime === "today"
        ? startOfDay(new Date())
        : filterTime === "7d"
          ? addDays(startOfDay(new Date()), -6)
          : filterTime === "30d"
            ? addDays(startOfDay(new Date()), -29)
            : null;
    return active.filter((t) => {
      if (filterProject !== "all" && t.linked_project_id !== filterProject)
        return false;
      if (filterStatus === "open" && t.linked_project_id) return false;
      if (filterStatus === "sorted" && !t.linked_project_id) return false;
      if (cutoff && new Date(t.created_at) < cutoff) return false;
      return true;
    });
  }, [active, filterProject, filterStatus, filterTime]);

  // ---- mutations (optimistic, then resync from the server) ----

  function patchLocal(id: string, patch: Partial<Thought>) {
    setThoughts((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }

  function run(promise: Promise<unknown>, failure: string) {
    promise.then(() => router.refresh()).catch(() => {
      showError(failure);
      router.refresh();
    });
  }

  function assign(id: string, projectId: string | null) {
    patchLocal(id, { linked_project_id: projectId, triaged: projectId != null });
    run(assignThoughtProject(id, projectId), "Could not assign the project.");
  }

  function archive(id: string, value: boolean) {
    patchLocal(id, { archived_at: value ? new Date().toISOString() : null });
    if (editingId === id) setEditingId(null);
    run(setThoughtArchived(id, value), "Could not update the thought.");
  }

  function startEdit(t: Thought) {
    setEditingId(t.id);
    setEditText(t.content);
    setEditProject(t.linked_project_id ?? "");
  }

  function saveEdit(id: string) {
    if (htmlIsEmpty(editText)) return;
    const projectId = editProject || null;
    patchLocal(id, {
      content: editText,
      linked_project_id: projectId,
      triaged: projectId != null,
      updated_at: new Date().toISOString(),
    });
    setEditingId(null);
    run(updateThought(id, editText, projectId), "Could not save the edit.");
  }

  const catFor = (t: Thought) =>
    t.linked_project_id ? (catById.get(t.linked_project_id) ?? null) : null;

  // Inline editor (text + project) — same toolbar as the entry modal.
  const editor = (t: Thought) => (
    <div
      className="mt-1"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveEdit(t.id);
        }
        if (e.key === "Escape") setEditingId(null);
      }}
    >
      <RichTextEditor value={editText} onChange={setEditText} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={editProject}
          onChange={(e) => setEditProject(e.target.value)}
          aria-label="Project"
          className={inputClass}
        >
          <option value="">No project</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setEditingId(null)}
            className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 sm:py-1.5 sm:text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => saveEdit(t.id)}
            disabled={htmlIsEmpty(editText)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:py-1.5 sm:text-xs"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  // Read-only content — tap to edit.
  const content = (t: Thought) => (
    <div
      onClick={() => startEdit(t)}
      className="mt-1.5 cursor-text text-sm leading-relaxed text-neutral-100 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }}
    />
  );

  // Standard app card + a subtle project-coloured wash (a faint tint + border),
  // not the saturated calendar-block treatment. Buttons use the app's neutral
  // style so the box sits naturally in the rest of the UI.
  const actionCls =
    "flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 sm:px-2.5 sm:py-1.5 sm:text-xs";

  const card = (t: Thought, isArchive: boolean) => {
    const cat = catFor(t);
    return (
      <div
        key={t.id}
        className={`rounded-xl border p-3.5 ${
          cat ? "" : "border-neutral-800/60 bg-neutral-900/40"
        } ${isArchive ? "opacity-70" : ""}`}
        style={
          cat
            ? {
                backgroundColor: withAlpha(cat.color, 0.12),
                borderColor: withAlpha(cat.color, 0.4),
              }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>{whenLabel(t.created_at)}</span>
          {!cat && !isArchive && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Open
            </span>
          )}
          {cat && (
            <span
              className="font-semibold"
              style={{ color: goalFrame(cat.color) }}
            >
              {cat.name}
            </span>
          )}
          {editingId !== t.id && (
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => startEdit(t)} className={actionCls}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              {isArchive ? (
                <button onClick={() => archive(t.id, false)} className={actionCls}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
              ) : (
                <button onClick={() => archive(t.id, true)} className={actionCls}>
                  <Check className="h-3.5 w-3.5" />
                  Complete
                </button>
              )}
            </div>
          )}
        </div>
        {editingId === t.id ? editor(t) : content(t)}
      </div>
    );
  };

  return (
    <div className="w-full flex-1 px-4 py-8 sm:px-6">
      {/* header */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
          Thoughts
        </h1>
        <span className="text-sm text-neutral-500">{open.length} open</span>
      </div>

      {/* ---------------- Open / to triage ---------------- */}
      <section className="mt-4">
        <button
          onClick={() => setOpenCollapsed((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 text-neutral-500 transition-transform ${
              openCollapsed ? "-rotate-90" : ""
            }`}
          />
          <h2 className="text-sm font-semibold text-neutral-200">
            Open — to triage
          </h2>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">
            {open.length}
          </span>
        </button>

        {!openCollapsed && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {open.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-600 sm:col-span-2">
                Inbox zero — nothing to triage.
              </p>
            )}
            {open.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3.5"
              >
                <div className="text-xs text-neutral-500">
                  {whenLabel(t.created_at)}
                </div>
                {editingId === t.id ? editor(t) : content(t)}
                {editingId !== t.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={t.linked_project_id ?? ""}
                      onChange={(e) => assign(t.id, e.target.value || null)}
                      aria-label="Assign to project"
                      className={inputClass}
                    >
                      <option value="">Assign to project…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => archive(t.id, true)}
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 sm:py-1.5 sm:text-xs"
                    >
                      <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      Complete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- All thoughts ---------------- */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-200">
            All thoughts
          </h2>
          <span className="text-sm text-neutral-500">{filtered.length}</span>
        </div>

        {/* filters — planner-style bar */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800/80 pb-4">
          <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/60 p-0.5 text-xs">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setFilterStatus(o.key)}
                className={
                  filterStatus === o.key
                    ? "rounded-md bg-neutral-800 px-3 py-2 font-medium text-neutral-100 sm:py-1.5"
                    : "rounded-md px-3 py-2 text-neutral-400 transition-colors hover:text-neutral-200 sm:py-1.5"
                }
              >
                {o.label}
              </button>
            ))}
          </div>

          {categories.length > 0 && (
            <>
              {/* desktop: chips. phones: a compact dropdown. */}
              <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
                <button
                  onClick={() => setFilterProject("all")}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    filterProject === "all"
                      ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                  }`}
                >
                  All projects
                </button>
                {categories.map((c) => {
                  const activeChip = filterProject === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setFilterProject(c.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        activeChip
                          ? ""
                          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                      }`}
                      style={
                        activeChip
                          ? {
                              backgroundColor: withAlpha(c.color, 0.18),
                              borderColor: withAlpha(c.color, 0.5),
                              color: goalFrame(c.color),
                            }
                          : undefined
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                aria-label="Filter by project"
                className={`${inputClass} sm:hidden`}
              >
                <option value="all">All projects</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <select
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value as TimeFilter)}
            aria-label="Filter by time"
            className={`${inputClass} ml-auto`}
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {filtered.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-600 sm:col-span-2">
              {active.length === 0
                ? "No thoughts yet. Tap the capture button to jot one down."
                : "No thoughts match these filters."}
            </p>
          )}
          {filtered.map((t) => card(t, false))}
        </div>
      </section>

      {/* ---------------- Archive ---------------- */}
      {archived.length > 0 && (
        <section className="mt-8 pb-8">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showArchive ? "" : "-rotate-90"}`}
            />
            Archive
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">
              {archived.length}
            </span>
          </button>
          {showArchive && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {archived.map((t) => card(t, true))}
            </div>
          )}
        </section>
      )}

      <Toast message={toast} />
    </div>
  );
}
