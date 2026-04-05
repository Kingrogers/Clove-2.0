import { useState, useEffect, useCallback, useMemo, useRef, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  createdAt?: number;
  folderId?: string;
}

interface Folder {
  id: string;
  name: string;
  color?: string;
}

interface StandaloneTask {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

type DashTask =
  | {
      kind: "standalone";
      id: string;
      title: string;
      done: boolean;
      createdAt: number;
    }
  | {
      kind: "note";
      id: string;
      noteId: string;
      noteTitle: string;
      lineIndex: number;
      title: string;
      done: boolean;
      createdAt: number;
    };

interface Props {
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
  onCreateNote: (title: string) => void;
  onSwitchView: (view: "notes" | "tasks") => void;
}

const TASK_LINE_RE = /^(\s*)[-*+] \[([ xX])\] (.+)$/;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function snippet(body: string, n = 120): string {
  const clean = body
    .replace(/^#+\s+/gm, "")
    .replace(/^(\s*)[-*+] \[([ xX])\]\s+/gm, "")
    .replace(/^(\s*)[-*+]\s+/gm, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>]/g, "")
    .trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function extractNoteTasks(note: Note): DashTask[] {
  const out: DashTask[] = [];
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

export default function HomeView({
  notes,
  folders,
  onOpenNote,
  onCreateNote,
  onSwitchView,
}: Props) {
  const [captureText, setCaptureText] = useState("");
  const [justCaptured, setJustCaptured] = useState(false);
  const [standaloneTasks, setStandaloneTasks] = useState<StandaloneTask[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const capturedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load standalone tasks on mount + when notes change (notes change might hint
  // at task flips)
  const loadTasks = useCallback(async () => {
    try {
      const t = await invoke<StandaloneTask[]>("list_tasks");
      setStandaloneTasks(t);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // All tasks unified
  const allTasks = useMemo<DashTask[]>(() => {
    const standalone: DashTask[] = standaloneTasks.map((t) => ({
      kind: "standalone",
      id: t.id,
      title: t.title,
      done: t.done,
      createdAt: t.createdAt,
    }));
    const fromNotes = notes.flatMap(extractNoteTasks);
    return [...standalone, ...fromNotes];
  }, [standaloneTasks, notes]);

  // Today's incomplete tasks - prioritise ones touched today, then newer ones
  const todaysTasks = useMemo(() => {
    const incomplete = allTasks.filter((t) => !t.done);
    incomplete.sort((a, b) => {
      const aToday = isToday(a.createdAt) ? 1 : 0;
      const bToday = isToday(b.createdAt) ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;
      return b.createdAt - a.createdAt;
    });
    return incomplete.slice(0, 6);
  }, [allTasks]);

  // Stats
  const stats = useMemo(() => {
    const doneToday = allTasks.filter((t) => t.done && isToday(t.createdAt));
    return {
      totalNotes: notes.length,
      doneToday: doneToday.length,
      folders: folders.length,
    };
  }, [allTasks, notes.length, folders.length]);

  // Recent notes (last 5 by updatedAt)
  const recentNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [notes]);

  const foldersById = useMemo(() => {
    const m = new Map<string, Folder>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  const handleCapture = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    onCreateNote(text);
    setCaptureText("");
    setJustCaptured(true);
    if (capturedTimer.current) clearTimeout(capturedTimer.current);
    capturedTimer.current = setTimeout(() => setJustCaptured(false), 1800);
    captureRef.current?.focus();
  }, [captureText, onCreateNote]);

  useEffect(() => {
    return () => {
      if (capturedTimer.current) clearTimeout(capturedTimer.current);
    };
  }, []);

  const handleCaptureKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCapture();
    }
  };

  const toggleTask = useCallback(
    async (task: DashTask) => {
      setToggling(task.id);
      const nextDone = !task.done;
      if (task.kind === "standalone") {
        const updated: StandaloneTask = {
          id: task.id,
          title: task.title,
          done: nextDone,
          createdAt: task.createdAt,
        };
        // Optimistic
        setStandaloneTasks((prev) =>
          prev.map((t) => (t.id === task.id ? updated : t))
        );
        try {
          await invoke("save_task", { task: updated });
        } catch {
          // revert
          setStandaloneTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, done: !nextDone } : t
            )
          );
        } finally {
          setToggling(null);
        }
        return;
      }
      // Note-sourced: load, flip the line, save
      try {
        const list = await invoke<Note[]>("list_notes");
        const note = list.find((n) => n.id === task.noteId);
        if (!note) {
          setToggling(null);
          return;
        }
        const lines = note.body.split("\n");
        const line = lines[task.lineIndex];
        if (!line) {
          setToggling(null);
          return;
        }
        const m = line.match(TASK_LINE_RE);
        if (!m) {
          setToggling(null);
          return;
        }
        lines[task.lineIndex] = line.replace(
          /\[([ xX])\]/,
          nextDone ? "[x]" : "[ ]"
        );
        const updatedNote: Note = {
          ...note,
          body: lines.join("\n"),
          updatedAt: Date.now(),
        };
        await invoke("save_note", { note: updatedNote });
        // The note list in App is the source of truth — but we don't have
        // access to update it here. Our local view updates via `notes` prop
        // on next render since the parent owns notes. For immediate feedback,
        // we optimistically track the flip through re-reading tasks list.
        await loadTasks();
      } catch {
        // best-effort
      } finally {
        setToggling(null);
      }
    },
    [loadTasks]
  );

  return (
    <main className="home-view home-dashboard">
      <div className="home-dash-inner">
        <header className="home-dash-header">
          <h1 className="home-dash-greeting">{getGreeting()}</h1>
          <p className="home-dash-date">{formatToday()}</p>
        </header>

        {/* Quick capture */}
        <section className="home-dash-capture">
          <label className="home-dash-capture-label">Quick capture</label>
          <div className={`home-dash-capture-box${justCaptured ? " captured" : ""}`}>
            <textarea
              ref={captureRef}
              className="home-dash-capture-input"
              placeholder="Jot down a thought… (Enter to save, Shift+Enter for new line)"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={handleCaptureKeyDown}
              rows={2}
              spellCheck={true}
            />
            <button
              type="button"
              className="home-dash-capture-btn"
              onClick={handleCapture}
              disabled={!captureText.trim()}
              title="Create note (Enter)"
            >
              {justCaptured ? "Saved" : "Create"}
            </button>
          </div>
        </section>

        {/* Stats row */}
        <section className="home-dash-stats">
          <button
            type="button"
            className="home-dash-stat"
            onClick={() => onSwitchView("notes")}
          >
            <div className="home-dash-stat-value">{stats.totalNotes}</div>
            <div className="home-dash-stat-label">
              {stats.totalNotes === 1 ? "Note" : "Notes"}
            </div>
          </button>
          <button
            type="button"
            className="home-dash-stat"
            onClick={() => onSwitchView("tasks")}
          >
            <div className="home-dash-stat-value">{stats.doneToday}</div>
            <div className="home-dash-stat-label">Done today</div>
          </button>
          <button
            type="button"
            className="home-dash-stat"
            onClick={() => onSwitchView("notes")}
          >
            <div className="home-dash-stat-value">{stats.folders}</div>
            <div className="home-dash-stat-label">
              {stats.folders === 1 ? "Folder" : "Folders"}
            </div>
          </button>
        </section>

        {/* Two-column grid: recent notes + today's tasks */}
        <div className="home-dash-grid">
          <section className="home-dash-panel">
            <div className="home-dash-panel-header">
              <h2 className="home-dash-panel-title">Recent notes</h2>
              {notes.length > 5 && (
                <button
                  type="button"
                  className="home-dash-panel-link"
                  onClick={() => onSwitchView("notes")}
                >
                  View all
                </button>
              )}
            </div>
            {recentNotes.length === 0 ? (
              <div className="home-dash-empty">
                No notes yet. Use quick capture above to start.
              </div>
            ) : (
              <div className="home-dash-recent-list">
                {recentNotes.map((n) => {
                  const folder = n.folderId ? foldersById.get(n.folderId) : null;
                  const preview = snippet(n.body, 100);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className="home-dash-recent-card"
                      onClick={() => onOpenNote(n.id)}
                    >
                      <div className="home-dash-recent-title">
                        {n.title || "Untitled"}
                      </div>
                      {preview && (
                        <div className="home-dash-recent-preview">{preview}</div>
                      )}
                      <div className="home-dash-recent-footer">
                        {folder ? (
                          <span className="home-dash-recent-folder">
                            {folder.name}
                          </span>
                        ) : (
                          <span className="home-dash-recent-folder home-dash-recent-folder-empty">
                            Unfiled
                          </span>
                        )}
                        <span className="home-dash-recent-time">
                          {formatRelativeTime(n.updatedAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-dash-panel">
            <div className="home-dash-panel-header">
              <h2 className="home-dash-panel-title">Today's tasks</h2>
              {allTasks.filter((t) => !t.done).length > 0 && (
                <button
                  type="button"
                  className="home-dash-panel-link"
                  onClick={() => onSwitchView("tasks")}
                >
                  View all
                </button>
              )}
            </div>
            {todaysTasks.length === 0 ? (
              <div className="home-dash-empty">
                Nothing on your plate. Add a task in the Tasks view or a checklist in any note.
              </div>
            ) : (
              <ul className="home-dash-task-list">
                {todaysTasks.map((t) => (
                  <li
                    key={t.id}
                    className={`home-dash-task${toggling === t.id ? " toggling" : ""}`}
                  >
                    <label className="home-dash-task-checkbox">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggleTask(t)}
                        disabled={toggling === t.id}
                      />
                      <span className="home-dash-task-check" />
                    </label>
                    <button
                      type="button"
                      className="home-dash-task-body"
                      onClick={() => {
                        if (t.kind === "note") onOpenNote(t.noteId);
                      }}
                      title={
                        t.kind === "note"
                          ? `Open “${t.noteTitle}”`
                          : "Standalone task"
                      }
                    >
                      <span className="home-dash-task-title">{t.title}</span>
                      {t.kind === "note" && (
                        <span className="home-dash-task-source">
                          {t.noteTitle}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
