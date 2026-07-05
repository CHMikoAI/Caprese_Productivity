"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createCategory,
  createTask,
  deleteCategory,
  deleteTask,
  updateCategory,
  updateTask,
} from "@/app/actions";
import { formatDayLong, formatTime } from "@/lib/dates";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  type CalendarEvent,
  type Category,
  type Task,
} from "@/lib/types";
import Toast, { useToast } from "@/components/Toast";

const inputClass =
  "rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";

export default function TasksView({
  initialTasks,
  initialCategories,
  taskEvents,
}: {
  initialTasks: Task[];
  initialCategories: Category[];
  taskEvents: CalendarEvent[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();

  const [tasks, setTasks] = useState(initialTasks);
  const [categories, setCategories] = useState(initialCategories);
  const [showDone, setShowDone] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setTasks(initialTasks), [initialTasks]);
  useEffect(() => setCategories(initialCategories), [initialCategories]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const eventByTask = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    for (const ev of taskEvents) {
      if (!ev.task_id) continue;
      const existing = map.get(ev.task_id);
      if (!existing || ev.start_at < existing.start_at) map.set(ev.task_id, ev);
    }
    return map;
  }, [taskEvents]);

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  // ----- task mutations -----

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const task = await createTask(title, newCategoryId || null);
      setTasks((list) => [task, ...list]);
      setNewTitle("");
      router.refresh();
    } catch {
      showError("Could not add the task.");
    }
    setBusy(false);
  }

  function toggleDone(task: Task, done: boolean) {
    const prev = tasks;
    setTasks((list) =>
      list.map((t) => (t.id === task.id ? { ...t, done } : t)),
    );
    updateTask(task.id, { done })
      .then(() => router.refresh())
      .catch(() => {
        setTasks(prev);
        showError("Could not update the task.");
      });
  }

  function changeTaskCategory(task: Task, categoryId: string | null) {
    const prev = tasks;
    setTasks((list) =>
      list.map((t) =>
        t.id === task.id ? { ...t, category_id: categoryId } : t,
      ),
    );
    updateTask(task.id, { category_id: categoryId })
      .then(() => router.refresh())
      .catch(() => {
        setTasks(prev);
        showError("Could not update the task.");
      });
  }

  function removeTask(task: Task) {
    const prev = tasks;
    setTasks((list) => list.filter((t) => t.id !== task.id));
    deleteTask(task.id)
      .then(() => router.refresh())
      .catch(() => {
        setTasks(prev);
        showError("Could not delete the task.");
      });
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ----- tasks ----- */}
        <section>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
              Tasks
            </h1>
            <span className="text-sm text-neutral-500">
              {openTasks.length} open
            </span>
          </div>

          <form
            onSubmit={addTask}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a task…"
              className={`${inputClass} flex-1`}
            />
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              className={`${inputClass} sm:w-44`}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>

          <ul className="mt-5 flex flex-col gap-2">
            {openTasks.length === 0 && (
              <li className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-600">
                No open tasks. Add one above.
              </li>
            )}
            {openTasks.map((task) => {
              const category = task.category_id
                ? categoryById.get(task.category_id)
                : undefined;
              const scheduled = eventByTask.get(task.id);
              return (
                <li
                  key={task.id}
                  className="group flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 transition-colors hover:border-neutral-700"
                >
                  <button
                    onClick={() => toggleDone(task, true)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-600 text-transparent transition-colors hover:border-accent hover:text-accent"
                    aria-label="Mark done"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-100">
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      {category && (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </span>
                      )}
                      {scheduled && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {formatDayLong(new Date(scheduled.start_at))} ·{" "}
                          {formatTime(new Date(scheduled.start_at))}
                        </span>
                      )}
                    </div>
                  </div>
                  <select
                    value={task.category_id ?? ""}
                    onChange={(e) =>
                      changeTaskCategory(task, e.target.value || null)
                    }
                    className="hidden w-32 shrink-0 truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs text-neutral-500 transition-colors hover:border-neutral-700 focus:border-neutral-600 focus:outline-none sm:block"
                    aria-label="Change category"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeTask(task)}
                    className="shrink-0 rounded-lg p-1.5 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-accent group-hover:opacity-100"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          {doneTasks.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showDone ? "" : "-rotate-90"}`}
                />
                Done
                <span className="text-neutral-600">{doneTasks.length}</span>
              </button>
              {showDone && (
                <ul className="mt-3 flex flex-col gap-2">
                  {doneTasks.map((task) => (
                    <li
                      key={task.id}
                      className="group flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/30 px-4 py-2.5"
                    >
                      <button
                        onClick={() => toggleDone(task, false)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-80"
                        aria-label="Mark as open"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <p className="min-w-0 flex-1 truncate text-sm text-neutral-500 line-through">
                        {task.title}
                      </p>
                      <button
                        onClick={() => removeTask(task)}
                        className="shrink-0 rounded-lg p-1.5 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-accent group-hover:opacity-100"
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ----- categories ----- */}
        <CategoryManager
          categories={categories}
          setCategories={setCategories}
          openTasks={openTasks}
          onError={showError}
        />
      </div>
      <Toast message={toast} />
    </div>
  );
}

function CategoryManager({
  categories,
  setCategories,
  openTasks,
  onError,
}: {
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  openTasks: Task[];
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_CATEGORY_COLOR);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const category = await createCategory(name, newColor);
      setCategories((list) =>
        [...list, category].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      router.refresh();
    } catch {
      onError("Could not add the category. Names must be unique.");
    }
    setBusy(false);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    const id = editingId;
    setEditingId(null);
    const prev = categories;
    setCategories((list) =>
      list.map((c) => (c.id === id ? { ...c, name, color: editColor } : c)),
    );
    updateCategory(id, { name, color: editColor })
      .then(() => router.refresh())
      .catch(() => {
        setCategories(prev);
        onError("Could not save the category.");
      });
  }

  function removeCategory(category: Category) {
    if (
      !window.confirm(
        `Delete "${category.name}"? Tasks and events keep existing without a category.`,
      )
    ) {
      return;
    }
    const prev = categories;
    setCategories((list) => list.filter((c) => c.id !== category.id));
    deleteCategory(category.id)
      .then(() => router.refresh())
      .catch(() => {
        setCategories(prev);
        onError("Could not delete the category.");
      });
  }

  return (
    <aside className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <h2 className="text-sm font-semibold text-neutral-200">Categories</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {categories.length === 0 && (
          <li className="py-2 text-sm text-neutral-600">No categories yet.</li>
        )}
        {categories.map((category) =>
          editingId === category.id ? (
            <li
              key={category.id}
              className="flex flex-col gap-2.5 rounded-xl border border-neutral-700 bg-neutral-900 p-3"
            >
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className={`${inputClass} w-full`}
              />
              <ColorPalette value={editColor} onChange={setEditColor} />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </li>
          ) : (
            <li
              key={category.id}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-900"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                {category.name}
              </span>
              <span className="text-xs text-neutral-600">
                {openTasks.filter((t) => t.category_id === category.id).length}
              </span>
              <button
                onClick={() => {
                  setEditingId(category.id);
                  setEditName(category.name);
                  setEditColor(category.color);
                }}
                className="rounded-md p-1 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
                aria-label="Edit category"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => removeCategory(category)}
                className="rounded-md p-1 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-accent group-hover:opacity-100"
                aria-label="Delete category"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ),
        )}
      </ul>
      <form
        onSubmit={addCategory}
        className="mt-4 flex flex-col gap-2.5 border-t border-neutral-800 pt-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category…"
          className={`${inputClass} w-full`}
        />
        <ColorPalette value={newColor} onChange={setNewColor} />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add category
        </button>
      </form>
    </aside>
  );
}

function ColorPalette({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`h-5 w-5 rounded-full transition-transform ${
            value === color
              ? "scale-110 ring-2 ring-neutral-300 ring-offset-2 ring-offset-neutral-900"
              : "hover:scale-110"
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Color ${color}`}
        />
      ))}
    </div>
  );
}
