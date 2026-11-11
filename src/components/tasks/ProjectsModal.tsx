"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/actions";
import Sheet from "@/components/Sheet";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  type Category,
  type Entry,
} from "@/lib/types";

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
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_CATEGORY_COLOR);

  const openCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.category_id) {
        counts.set(task.category_id, (counts.get(task.category_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

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

  function saveEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    const id = editingId;
    const before = categories.find((c) => c.id === id);
    setEditingId(null);
    if (!before || (before.name === name && before.color === editColor)) return;
    setCategories((list) =>
      list.map((c) => (c.id === id ? { ...c, name, color: editColor } : c)),
    );
    updateCategory(id, { name, color: editColor })
      .then(() => router.refresh())
      .catch(() => {
        setCategories((list) => list.map((c) => (c.id === id ? before : c)));
        onError("Could not save the project. Names must be unique.");
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
    setCategories((list) => list.filter((c) => c.id !== project.id));
    deleteCategory(project.id)
      .then(() => router.refresh())
      .catch(() => {
        setCategories((list) =>
          [...list, project].sort((a, b) => a.name.localeCompare(b.name)),
        );
        onError("Could not delete the project.");
      });
  }

  return (
    <Sheet title="Projects" onClose={onClose}>
      <ul className="-mx-2 flex flex-col">
        {categories.length === 0 && (
          <li className="px-2 py-3 text-sm text-neutral-500">
            No projects yet — add the first one below.
          </li>
        )}
        {categories.map((project) =>
          editingId === project.id ? (
            <li
              key={project.id}
              className="mx-2 my-1 flex flex-col gap-3 rounded-xl bg-neutral-800/60 p-3"
            >
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") {
                    // Cancel the edit only — don't let the dialog's own Escape
                    // handler close the whole thing too.
                    e.stopPropagation();
                    setEditingId(null);
                  }
                }}
                aria-label="Project name"
                className="field"
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
                  className="btn-ghost py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editName.trim()}
                  className="btn-primary py-2"
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  Save
                </button>
              </div>
            </li>
          ) : (
            <li key={project.id} className="flex items-center gap-2.5 pl-2">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                {project.name}
              </span>
              <span
                className="text-xs tabular-nums text-neutral-500"
                title="Open tasks, to-dos and goals"
              >
                {openCount.get(project.id) ?? 0}
              </span>
              <span className="flex shrink-0">
                <button
                  onClick={() => {
                    setEditingId(project.id);
                    setEditName(project.name);
                    setEditColor(project.color);
                  }}
                  className="icon-btn"
                  aria-label={`Edit ${project.name}`}
                  title="Rename or recolour"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => removeProject(project)}
                  className="icon-btn"
                  aria-label={`Delete ${project.name}`}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ),
        )}
      </ul>

      <form
        onSubmit={addProject}
        className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4"
      >
        <span className="section-label">New project</span>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name…"
          aria-label="New project name"
          enterKeyHint="done"
          className="field"
        />
        <ColorPalette
          value={newColor}
          onChange={setNewColor}
          categories={categories}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="btn-primary"
        >
          Add project
        </button>
      </form>
    </Sheet>
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
    <div className="flex flex-wrap gap-2.5 sm:gap-2" role="group" aria-label="Colour">
      {CATEGORY_COLORS.map((color) => {
        const usedBy = namesByColor.get(color);
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-pressed={selected}
            // A colour another project already wears stays pickable — the dot
            // in its middle just says so, and the tooltip names the project.
            title={usedBy ? `Used by ${usedBy.join(", ")}` : undefined}
            aria-label={
              usedBy ? `Colour ${color} — used by ${usedBy.join(", ")}` : `Colour ${color}`
            }
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform sm:h-7 sm:w-7 ${
              selected
                ? "ring-2 ring-neutral-100 ring-offset-2 ring-offset-neutral-900"
                : "active:scale-90"
            }`}
            style={{ backgroundColor: color }}
          >
            {selected ? (
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            ) : (
              usedBy && <span className="h-1.5 w-1.5 rounded-full bg-black/45" />
            )}
          </button>
        );
      })}
    </div>
  );
}
