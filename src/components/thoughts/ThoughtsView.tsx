"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Lightbulb,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  assignThoughtProject,
  deleteThought,
  restoreThought,
  setThoughtArchived,
  updateThought,
} from "@/app/actions";
import PageHeader from "@/components/PageHeader";
import ProjectChips from "@/components/ProjectChips";
import RichTextEditor from "@/components/RichTextEditor";
import Section from "@/components/Section";
import ThoughtComposer from "@/components/thoughts/ThoughtComposer";
import Toast, { useToast } from "@/components/Toast";
import { goalFrame, withAlpha } from "@/lib/colorContrast";
import { addDays, formatDMY, formatTime, isSameDay, startOfDay } from "@/lib/dates";
import { sanitizeHtml } from "@/lib/sanitize";
import { useShortcuts } from "@/lib/useShortcuts";
import type { Category, Thought, ThoughtSource } from "@/lib/types";

type TimeFilter = "all" | "today" | "7d" | "30d";

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

const gridClass = "grid items-start gap-2 sm:grid-cols-2";
const proseClass =
  "text-sm leading-relaxed text-neutral-100 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5";

/**
 * The capture inbox. Thoughts are added here and only here — "New" for typing,
 * the microphone for a voice note — and every thought lives in exactly one of
 * three places: the **Inbox** until it is sorted, **Sorted** once it belongs to
 * a project, the **Archive** once it is completed.
 */
export default function ThoughtsView({
  initialThoughts,
  categories,
}: {
  initialThoughts: Thought[];
  categories: Category[];
}) {
  const router = useRouter();
  const { message: toast, show: showToast, dismiss: dismissToast } = useToast();

  // Sync from the server prop without an effect (derive during render).
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [prevInitial, setPrevInitial] = useState(initialThoughts);
  if (prevInitial !== initialThoughts) {
    setPrevInitial(initialThoughts);
    setThoughts(initialThoughts);
  }

  // The capture sheet: null = closed, otherwise what it opens on.
  const [composer, setComposer] = useState<ThoughtSource | null>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);
  const [sortedCollapsed, setSortedCollapsed] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editProject, setEditProject] = useState("");

  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterTime, setFilterTime] = useState<TimeFilter>("all");

  useShortcuts({
    n: () => setComposer("text"),
    v: () => setComposer("voice"),
  });

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const { inbox, sorted, archived } = useMemo(() => {
    const newestFirst = [...thoughts].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    );
    const active = newestFirst.filter((t) => !t.archived_at);
    return {
      // The inbox = active thoughts that haven't been given a project yet.
      inbox: active.filter((t) => !t.linked_project_id),
      sorted: active.filter((t) => t.linked_project_id),
      archived: newestFirst.filter((t) => t.archived_at),
    };
  }, [thoughts]);

  // Only projects that actually hold a thought are worth a filter chip.
  const sortedProjects = useMemo(
    () =>
      categories.filter((c) => sorted.some((t) => t.linked_project_id === c.id)),
    [categories, sorted],
  );
  // A filter whose project has emptied out (or was deleted) falls back to All.
  const projectFilter = sortedProjects.some((c) => c.id === filterProject)
    ? filterProject
    : "all";

  const sortedShown = useMemo(() => {
    const cutoff =
      filterTime === "today"
        ? startOfDay(new Date())
        : filterTime === "7d"
          ? addDays(startOfDay(new Date()), -6)
          : filterTime === "30d"
            ? addDays(startOfDay(new Date()), -29)
            : null;
    return sorted.filter((t) => {
      if (projectFilter !== "all" && t.linked_project_id !== projectFilter)
        return false;
      if (cutoff && new Date(t.created_at) < cutoff) return false;
      return true;
    });
  }, [sorted, projectFilter, filterTime]);

  // ---- mutations (optimistic, then resync from the server) ----

  function patchLocal(id: string, patch: Partial<Thought>) {
    setThoughts((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }

  function run(promise: Promise<unknown>, failure: string) {
    promise
      .then(() => router.refresh())
      .catch(() => {
        showToast(failure);
        router.refresh();
      });
  }

  function assign(thought: Thought, projectId: string | null) {
    patchLocal(thought.id, {
      linked_project_id: projectId,
      triaged: projectId != null,
    });
    run(
      assignThoughtProject(thought.id, projectId),
      "Could not assign the project.",
    );
    const project = projectId ? catById.get(projectId) : undefined;
    if (project) {
      // The card just left the inbox — say where it went, and offer the way back.
      showToast(`Sorted into ${project.name}`, {
        label: "Undo",
        run: () => assign({ ...thought, linked_project_id: projectId }, null),
      });
    }
  }

  function archive(thought: Thought, value: boolean) {
    patchLocal(thought.id, {
      archived_at: value ? new Date().toISOString() : null,
    });
    if (editingId === thought.id) setEditingId(null);
    run(setThoughtArchived(thought.id, value), "Could not update the thought.");
    showToast(
      value ? "Completed" : "Restored",
      value ? { label: "Undo", run: () => archive(thought, false) } : undefined,
    );
  }

  /** Delete for good — only offered in the archive, and still undoable. */
  function remove(thought: Thought) {
    const putBack = () =>
      setThoughts((list) =>
        list.some((t) => t.id === thought.id) ? list : [thought, ...list],
      );
    setThoughts((list) => list.filter((t) => t.id !== thought.id));
    const deleted = deleteThought(thought.id)
      .then(() => router.refresh())
      .catch(() => {
        putBack();
        showToast("Could not delete the thought.");
      });
    showToast("Thought deleted", {
      label: "Undo",
      run: () => {
        putBack();
        // Wait for the delete to land first, or the two would cross.
        deleted
          .then(() => restoreThought(thought))
          .then(() => router.refresh())
          .catch(() => {
            setThoughts((list) => list.filter((t) => t.id !== thought.id));
            showToast("Could not restore the thought.");
          });
      },
    });
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

  function onCaptured(thought: Thought) {
    setComposer(null);
    setThoughts((list) => [thought, ...list]);
    // Make sure the new card is on screen, wherever it was filed.
    if (thought.linked_project_id) setSortedCollapsed(false);
    else setInboxCollapsed(false);
    router.refresh();
    showToast("Thought captured");
  }

  // ---- card pieces ----

  // Inline editor (text + project) — same toolbar as the entry dialog.
  const editor = (t: Thought) => (
    <div
      className="mt-2"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveEdit(t.id);
        }
        if (e.key === "Escape") setEditingId(null);
      }}
    >
      <RichTextEditor value={editText} onChange={setEditText} autoFocus />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={editProject}
          onChange={(e) => setEditProject(e.target.value)}
          aria-label="Project"
          className="field min-w-0 flex-1 basis-40 py-2"
        >
          <option value="">No project</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setEditingId(null)} className="btn-ghost py-2">
            Cancel
          </button>
          <button
            onClick={() => saveEdit(t.id)}
            disabled={htmlIsEmpty(editText)}
            className="btn-primary py-2"
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
      className={`mt-1 cursor-text ${proseClass}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }}
    />
  );

  const editButton = (t: Thought) => (
    <button
      onClick={() => startEdit(t)}
      className="icon-btn"
      aria-label="Edit"
      title="Edit"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );

  /** Inbox card: the thought, and the two ways out of the inbox. */
  const inboxCard = (t: Thought) => {
    const editing = editingId === t.id;
    return (
      <div key={t.id} className="card px-3.5 pb-3.5 pt-1.5">
        <div className="-mr-2 flex min-h-11 items-center gap-2 text-xs text-neutral-500">
          <span>{whenLabel(t.created_at)}</span>
          {!editing && <span className="ml-auto flex">{editButton(t)}</span>}
        </div>
        {editing ? editor(t) : content(t)}
        {!editing && (
          <div className="mt-3 flex items-center gap-2">
            {categories.length > 0 && (
              <select
                value=""
                onChange={(e) => assign(t, e.target.value || null)}
                aria-label="Assign to project"
                className="field min-w-0 flex-1 py-2"
              >
                <option value="">Assign to project…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => archive(t, true)}
              className="btn-plain ml-auto shrink-0 px-3.5 py-2"
              title="Complete — move it to the archive"
            >
              <Check className="h-4 w-4" />
              Complete
            </button>
          </div>
        )}
      </div>
    );
  };

  /** Sorted or archived card, washed in its project's colour. */
  const filedCard = (t: Thought, isArchive: boolean) => {
    const cat = t.linked_project_id
      ? (catById.get(t.linked_project_id) ?? null)
      : null;
    const editing = editingId === t.id;
    return (
      <div
        key={t.id}
        // A subtle project-coloured wash — a faint tint, not the saturated
        // calendar-block treatment — so the card sits naturally in the page.
        className={`rounded-2xl px-3.5 pb-3.5 pt-1.5 ${cat ? "" : "bg-neutral-900"} ${
          isArchive ? "opacity-70" : ""
        }`}
        style={cat ? { backgroundColor: withAlpha(cat.color, 0.14) } : undefined}
      >
        <div className="-mr-2 flex min-h-11 items-center gap-x-2 text-xs text-neutral-500">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            {cat && (
              <span
                className="truncate font-semibold"
                style={{ color: goalFrame(cat.color) }}
              >
                {cat.name}
              </span>
            )}
            <span className="shrink-0">{whenLabel(t.created_at)}</span>
          </span>
          {!editing && (
            <span className="ml-auto flex shrink-0">
              {editButton(t)}
              {isArchive ? (
                <>
                  <button
                    onClick={() => archive(t, false)}
                    className="icon-btn"
                    aria-label="Restore"
                    title="Restore"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="icon-btn"
                    aria-label="Delete"
                    title="Delete for good"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => archive(t, true)}
                  className="icon-btn"
                  aria-label="Complete"
                  title="Complete — move it to the archive"
                >
                  <Check className="h-[18px] w-[18px]" />
                </button>
              )}
            </span>
          )}
        </div>
        {editing ? editor(t) : content(t)}
      </div>
    );
  };

  const captureButtons = (
    <>
      <button
        onClick={() => setComposer("voice")}
        className="icon-btn bg-neutral-800 text-neutral-200"
        aria-label="Voice note"
        title="Voice note (V)"
      >
        <Mic className="h-[18px] w-[18px]" />
      </button>
      <button
        onClick={() => setComposer("text")}
        title="New thought (N)"
        className="btn-primary px-3.5 sm:py-1.5"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        New
      </button>
    </>
  );

  const nothingYet = thoughts.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-page sm:px-6 sm:pt-6">
      <PageHeader
        title="Thoughts"
        meta={
          inbox.length > 0 && (
            <span className="hidden sm:inline">{inbox.length} to sort</span>
          )
        }
        actions={captureButtons}
      />

      {nothingYet ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            <Lightbulb className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-semibold text-neutral-50">
            Nothing captured yet
          </p>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-neutral-500">
            Catch an idea before it is gone — type it, or say it out loud and
            have it transcribed.
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setComposer("voice")} className="btn-plain">
              <Mic className="h-4 w-4" />
              Voice note
            </button>
            <button onClick={() => setComposer("text")} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New thought
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---------------- Inbox: captured, not sorted yet ---------------- */}
          <Section
            title="Inbox"
            count={inbox.length}
            hint="Give each one a project, or complete it."
            collapsed={inboxCollapsed}
            onToggle={() => setInboxCollapsed((v) => !v)}
            className="mt-3"
          >
            {inbox.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">
                Inbox zero — nothing to sort.
              </p>
            ) : (
              <div className={gridClass}>{inbox.map(inboxCard)}</div>
            )}
          </Section>

          {/* ---------------- Sorted: filed under a project ---------------- */}
          {sorted.length > 0 && (
            <Section
              title="Sorted"
              count={sortedShown.length}
              collapsed={sortedCollapsed}
              onToggle={() => setSortedCollapsed((v) => !v)}
              action={
                <select
                  value={filterTime}
                  onChange={(e) => setFilterTime(e.target.value as TimeFilter)}
                  aria-label="Filter by time"
                  className="field w-auto shrink-0 py-1.5"
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              }
            >
              {sortedProjects.length > 1 && (
                <div className="mb-3">
                  <ProjectChips
                    categories={sortedProjects}
                    value={projectFilter}
                    onChange={setFilterProject}
                  />
                </div>
              )}
              {sortedShown.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">
                  No thoughts match these filters.
                </p>
              ) : (
                <div className={gridClass}>
                  {sortedShown.map((t) => filedCard(t, false))}
                </div>
              )}
            </Section>
          )}

          {/* ---------------- Archive: completed ---------------- */}
          {archived.length > 0 && (
            <section className="mt-8">
              <button
                onClick={() => setShowArchive((v) => !v)}
                aria-expanded={showArchive}
                className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showArchive ? "" : "-rotate-90"}`}
                />
                Archive
                <span className="font-normal text-neutral-600">
                  {archived.length}
                </span>
              </button>
              {showArchive && (
                <div className={`mt-1 ${gridClass}`}>
                  {archived.map((t) => filedCard(t, true))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {composer && (
        <ThoughtComposer
          startWith={composer}
          categories={categories}
          onSaved={onCaptured}
          onClose={() => setComposer(null)}
        />
      )}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
