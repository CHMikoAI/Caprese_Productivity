"use client";

import { GripVertical, X } from "lucide-react";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import type { Category, Entry } from "@/lib/types";

export default function TaskSidebar({
  open,
  tasks,
  categoryById,
  onDragStartTask,
  onDragEndTask,
  onClose,
}: {
  open: boolean;
  tasks: Entry[];
  categoryById: Map<string, Category>;
  onDragStartTask: (task: Entry) => void;
  onDragEndTask: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-72 flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl md:static md:bg-neutral-900/30 md:shadow-none">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-neutral-200">
          To plan
          <span className="ml-1.5 text-neutral-500">{tasks.length}</span>
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {tasks.length === 0 ? (
          <p className="pt-6 text-center text-sm text-neutral-600">
            Nothing left to schedule.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => {
              const category = task.category_id
                ? categoryById.get(task.category_id)
                : undefined;
              const TypeIcon = ENTRY_TYPE_ICON[task.type];
              return (
                <li
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "copyMove";
                    onDragStartTask(task);
                  }}
                  onDragEnd={onDragEndTask}
                  className="group flex cursor-grab items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2.5 transition-colors hover:border-neutral-700 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-neutral-600" />
                  <TypeIcon
                    className="h-3.5 w-3.5 shrink-0 text-neutral-500"
                    aria-label={task.type}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-100">
                      {task.title}
                    </p>
                    {category && (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {category.name}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="pt-4 text-xs leading-relaxed text-neutral-600">
          Drag an item onto the calendar to schedule it (1 h by default).
        </p>
      </div>
    </aside>
  );
}
