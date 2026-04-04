import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import BlockEditor from "./BlockEditor";
import ChatPanel from "./ChatPanel";
import TasksView from "./TasksView";
import "./App.css";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState<"notes" | "tasks">("notes");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<Note[]>("list_notes").then((diskNotes) => {
      if (diskNotes.length === 0) {
        const welcome: Note = {
          id: crypto.randomUUID(),
          title: "Welcome to Clove",
          body: "Clove is a minimal note-taking app.\n\nStart writing your thoughts here.",
          updatedAt: Date.now(),
        };
        invoke("save_note", { note: welcome }).then(() => {
          setNotes([welcome]);
          setActiveId(welcome.id);
          setLoaded(true);
        });
      } else {
        setNotes(diskNotes);
        setActiveId(diskNotes[0].id);
        setLoaded(true);
      }
    });
  }, []);

  const saveToDisk = useCallback((note: Note) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      invoke("save_note", { note });
    }, 300);
  }, []);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const createNote = useCallback(() => {
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      updatedAt: Date.now(),
    };
    invoke("save_note", { note });
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, []);

  const updateNote = useCallback((id: string, field: "title" | "body", value: string) => {
    setNotes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== id) return n;
        const next = { ...n, [field]: value, updatedAt: Date.now() };
        saveToDisk(next);
        return next;
      });
      return updated;
    });
  }, [saveToDisk]);

  const deleteNote = useCallback((id: string) => {
    invoke("delete_note", { id });
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (id === activeId) {
        setActiveId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeId]);

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  if (!loaded) {
    return (
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 className="logo">Clove</h1>
          </div>
        </aside>
        <main className="editor">
          <div className="editor-empty">
            <p>Loading notes...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Clove</h1>
          {view === "notes" && (
            <button className="new-note-btn" onClick={createNote} title="New note">+</button>
          )}
        </div>

        <div className="view-switcher">
          <button
            className={`view-tab ${view === "notes" ? "active" : ""}`}
            onClick={() => setView("notes")}
          >
            Notes
          </button>
          <button
            className={`view-tab ${view === "tasks" ? "active" : ""}`}
            onClick={() => setView("tasks")}
          >
            Tasks
          </button>
        </div>

        {view === "notes" && (
          <>
            <div className="search-wrapper">
              <input
                type="text"
                className="search"
                placeholder="Search notes..."
              />
            </div>

            <nav className="notes-list">
              {sorted.map((note) => (
                <div
                  key={note.id}
                  className={`note-item ${note.id === activeId ? "active" : ""}`}
                  onClick={() => setActiveId(note.id)}
                >
                  <span className="note-item-title">
                    {note.title || "Untitled"}
                  </span>
                  <div className="note-item-bottom">
                    <span className="note-item-meta">
                      {formatTime(note.updatedAt)}
                    </span>
                    <button
                      className="note-delete-btn"
                      title="Delete note"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </nav>
          </>
        )}
      </aside>

      {view === "notes" ? (
        <>
          <main className="editor">
            {activeNote ? (
              <>
                <div className="editor-header">
                  <input
                    type="text"
                    className="editor-title"
                    placeholder="Untitled"
                    value={activeNote.title}
                    onChange={(e) => updateNote(activeNote.id, "title", e.target.value)}
                  />
                  <button
                    className={`ai-toggle ${chatOpen ? "active" : ""}`}
                    onClick={() => setChatOpen((o) => !o)}
                    title="Toggle AI assistant"
                  >
                    AI
                  </button>
                </div>
                <BlockEditor
                  key={activeNote.id}
                  noteId={activeNote.id}
                  content={activeNote.body}
                  onChange={(md) => updateNote(activeNote.id, "body", md)}
                />
              </>
            ) : (
              <div className="editor-empty">
                <p>Create a note to get started</p>
              </div>
            )}
          </main>

          {chatOpen && activeNote && (
            <ChatPanel
              noteTitle={activeNote.title}
              noteBody={activeNote.body}
            />
          )}
        </>
      ) : (
        <TasksView />
      )}
    </div>
  );
}

export default App;
