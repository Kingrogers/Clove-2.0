import { useState, useEffect, useCallback, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

interface StandaloneTask {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

type UnifiedTask =
  | {
      kind: "standalone";
      id: string;
      title: string;
      done: boolean;
      createdAt: number;
    }
  | {
      kind: "note";
      id: string; // note-<noteId>-<lineIndex>
      noteId: string;
      noteTitle: string;
      lineIndex: number;
      title: string;
      done: boolean;
      createdAt: number;
    };

const TASK_LINE_RE = /^(\s*)[-*+] \[([ xX])\] (.+)$/;

function extractNoteTasks(note: Note): UnifiedTask[] {
  const out: UnifiedTask[] = [];
  const lines = note.body.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(TASK_LINE_RE);
    if (!m) return;
    out.push({
      kind: "note",
      id: `note-${note.id}-${i}`,
      noteId: note.id,
      noteTitle: note.title || "Untitled",
      lineIndex: i,
      title: m[3],
      done: m[2] === "x" || m[2] === "X",
      createdAt: note.updatedAt,
    });
  });
  return out;
}

export default function TasksView() {
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [standalone, notes] = await Promise.all([
      invoke<StandaloneTask[]>("list_tasks"),
      invoke<Note[]>("list_notes"),
    ]);
    const standaloneUnified: UnifiedTask[] = standalone.map((t) => ({
      kind: "standalone",
      id: t.id,
      title: t.title,
      done: t.done,
      createdAt: t.createdAt,
    }));
    const noteUnified = notes.flatMap(extractNoteTasks);
    setTasks([...standaloneUnified, ...noteUnified]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addTask = useCallback(() => {
    const title = input.trim();
    if (!title) return;
    const task: StandaloneTask = {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: Date.now(),
    };
    invoke("save_task", { task });
    setTasks((prev) => [
      { kind: "standalone", id: task.id, title, done: false, createdAt: task.createdAt },
      ...prev,
    ]);
    setInput("");
  }, [input]);

  const toggleTask = useCallback(
    async (task: UnifiedTask) => {
      const nextDone = !task.done;
      // Optimistic UI
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t))
      );

      if (task.kind === "standalone") {
        const updated: StandaloneTask = {
          id: task.id,
          title: task.title,
          done: nextDone,
          createdAt: task.createdAt,
        };
        await invoke("save_task", { task: updated });
        return;
      }

      // Note-sourced: load latest note, flip the checkbox on its line, save
      const notes = await invoke<Note[]>("list_notes");
      const note = notes.find((n) => n.id === task.noteId);
      if (!note) return;
      const lines = note.body.split("\n");
      const line = lines[task.lineIndex];
      if (!line) return;
      const m = line.match(TASK_LINE_RE);
      if (!m) return;
      const newLine = line.replace(
        /\[([ xX])\]/,
        nextDone ? "[x]" : "[ ]"
      );
      lines[task.lineIndex] = newLine;
      const updatedNote: Note = {
        ...note,
        body: lines.join("\n"),
        updatedAt: Date.now(),
      };
      await invoke("save_note", { note: updatedNote });
    },
    []
  );

  const deleteTask = useCallback(async (task: UnifiedTask) => {
    if (task.kind !== "standalone") return; // note tasks are managed in the note
    await invoke("delete_task", { id: task.id });
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTask();
  };

  if (!loaded) {
    return (
      <main className="tasks-view">
        <div className="tasks-empty-state">
          <p>Loading tasks...</p>
        </div>
      </main>
    );
  }

  const incomplete = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  return (
    <main className="tasks-view">
      <div className="tasks-header">
        <h1 className="tasks-title">Tasks</h1>
      </div>
      <div className="tasks-input-wrapper">
        <input
          type="text"
          className="tasks-input"
          placeholder="Add a task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
      <div className="tasks-list">
        {tasks.length === 0 && (
          <div className="tasks-empty-state">
            <p>No tasks yet. Add one above or create a checklist in a note.</p>
          </div>
        )}
        {incomplete.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        ))}
        {completed.length > 0 && (
          <>
            <div className="tasks-section-label">Completed</div>
            {completed.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: UnifiedTask;
  onToggle: (task: UnifiedTask) => void;
  onDelete: (task: UnifiedTask) => void;
}) {
  return (
    <div className={`task-item ${task.done ? "done" : ""}`}>
      <label className="task-checkbox">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task)}
        />
        <span className="task-checkbox-visual" />
      </label>
      <span className="task-title">{task.title}</span>
      {task.kind === "note" && (
        <span className="task-source-badge" title={`From note: ${task.noteTitle}`}>
          {task.noteTitle}
        </span>
      )}
      {task.kind === "standalone" && (
        <button
          className="task-delete-btn"
          onClick={() => onDelete(task)}
          title="Delete task"
        >
          &times;
        </button>
      )}
    </div>
  );
}
