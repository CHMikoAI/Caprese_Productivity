"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/actions";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  type Category,
  type Entry,
} from "@/lib/types";
import { useEscape } from "@/lib/useShortcuts";

const inputClass =
  "rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";

export default function ProjectsModal({
  categories,
  setCategories,
  tasks,
  onError,
  onClose,
}: {
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  tasks: Entry[];
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  useEscape(onClose);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_CATEGORY_COLOR);

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const project = await createCategory(name, newColor);
      setCategories((list) =>
        [...list, project].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewColor(DEFAULT_CATEGORY_COLOR);
      router.refresh();
    } catch {
      onError("Could not add the project. Names must be unique.");
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
        onError("Could not save the project.");
      });
  }

  function removeProject(project: Category) {
    if (
      !window.confirm(
        `Delete "${project.name}"? Tasks and events keep existing without a project.`,
      )
    ) {
      return;
    }
    const prev = categories;
    setCategories((list) => list.filter((c) => c.id !== project.id));
    deleteCategory(project.id)
      .then(() => router.refresh())
      .catch(() => {
        setCategories(prev);
        onError("Could not delete the project.");
      });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">Projects</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {categories.length === 0 && (
            <li className="py-2 text-sm text-neutral-600">No projects yet.</li>
          )}
          {categories.map((project) =>
            editingId === project.id ? (
              <li
                key={project.id}
                className="flex flex-col gap-2.5 rounded-xl border border-neutral-700 bg-neutral-900 p-3"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") {
                      // Cancel the edit only — don't let the window-level
                      // Escape handler close the whole dialog too.
                      e.stopPropagation();
                      setEditingId(null);
                    }
                  }}
                  className={`${inputClass} w-full`}
                />
                <ColorPalette
                  value={editColor}
                  onChange={setEditColor}
                  categories={categories}
                  excludeId={project.id}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save
                  </button>
                </div>
              </li>
            ) : (
              <li
                key={project.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-800/60"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                  {project.name}
                </span>
                <span className="text-xs text-neutral-600">
                  {tasks.filter((t) => t.category_id === project.id).length}
                </span>
                <button
                  onClick={() => {
                    setEditingId(project.id);
                    setEditName(project.name);
                    setEditColor(project.color);
                  }}
                  className="rounded-md p-1 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
                  aria-label="Edit project"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeProject(project)}
                  className="rounded-md p-1 text-neutral-600 opacity-0 transition-all hover:bg-neutral-800 hover:text-accent group-hover:opacity-100"
                  aria-label="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>

        <form
          onSubmit={addProject}
          className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4"
        >
          <span className="text-xs font-medium text-neutral-500">New project</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name…"
            className={`${inputClass} w-full`}
          />
          <ColorPalette
            value={newColor}
            onChange={setNewColor}
            categories={categories}
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add project
          </button>
        </form>
      </div>
    </div>
  );
}

function ColorPalette({
  value,
  onChange,
  categories,
  excludeId,
}: {
  value: string;
  onChange: (color: string) => void;
  categories: Category[];
  /** The project being edited, if any — its own color isn't flagged as "taken". */
  excludeId?: string;
}) {
  const namesByColor = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of categories) {
      if (c.id === excludeId) continue;
      const names = map.get(c.color);
      if (names) names.push(c.name);
      else map.set(c.color, [c.name]);
    }
    return map;
  }, [categories, excludeId]);

  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((color) => {
        const usedBy = namesByColor.get(color);
        return (
          <div key={color} className="group/swatch relative">
            <button
              type="button"
              onClick={() => onChange(color)}
              className={`h-6 w-6 rounded-full transition-transform ${
                value === color
                  ? "scale-110 ring-2 ring-neutral-100 ring-offset-2 ring-offset-neutral-900"
                  : usedBy
                    ? "ring-1 ring-neutral-500 ring-offset-1 ring-offset-neutral-900 hover:scale-110"
                    : "hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
              aria-label={
                usedBy ? `Color ${color} — used by ${usedBy.join(", ")}` : `Color ${color}`
              }
            />
            {usedBy && (
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-max max-w-[10rem] -translate-x-1/2 truncate rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-300 shadow-xl group-hover/swatch:block">
                {usedBy.join(", ")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
