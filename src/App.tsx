import { useState, useEffect, useCallback } from "react";
import BlockEditor from "./BlockEditor";
import "./App.css";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

type EditorMode = "block" | "markdown";

const STORAGE_KEY = "clove-notes";

function loadNotes(): Note[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // corrupted — fall through to defaults
    }
  }
  const defaults: Note[] = [
    {
      id: crypto.randomUUID(),
      title: "Welcome to Clove",
      body: "Clove is a minimal note-taking app.\n\nStart writing your thoughts here.",
      updatedAt: Date.now(),
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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

function initState(): { notes: Note[]; activeId: string | null } {
  const notes = loadNotes();
  return { notes, activeId: notes.length > 0 ? notes[0].id : null };
}

function App() {
  const [initial] = useState(initState);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const [editorMode, setEditorMode] = useState<EditorMode>("block");

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const createNote = useCallback(() => {
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      updatedAt: Date.now(),
    };
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, []);

  const updateNote = useCallback((id: string, field: "title" | "body", value: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, [field]: value, updatedAt: Date.now() } : n
      )
    );
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (id === activeId) {
        setActiveId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeId]);

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Clove</h1>
          <button className="new-note-btn" onClick={createNote} title="New note">+</button>
        </div>

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
      </aside>

      {/* Editor */}
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
              <div className="editor-toolbar">
                <div className="mode-toggle">
                  <button
                    className={`mode-btn ${editorMode === "block" ? "active" : ""}`}
                    onClick={() => setEditorMode("block")}
                  >
                    Block
                  </button>
                  <button
                    className={`mode-btn ${editorMode === "markdown" ? "active" : ""}`}
                    onClick={() => setEditorMode("markdown")}
                  >
                    Markdown
                  </button>
                </div>
              </div>
            </div>

            {editorMode === "block" ? (
              <BlockEditor
                key={activeNote.id}
                noteId={activeNote.id}
                content={activeNote.body}
                onChange={(md) => updateNote(activeNote.id, "body", md)}
              />
            ) : (
              <textarea
                className="editor-body markdown-editor"
                placeholder="Write in markdown..."
                value={activeNote.body}
                onChange={(e) => updateNote(activeNote.id, "body", e.target.value)}
                spellCheck={false}
              />
            )}
          </>
        ) : (
          <div className="editor-empty">
            <p>Create a note to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
