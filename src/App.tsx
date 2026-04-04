import { useState } from "react";
import "./App.css";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: Date;
}

const SAMPLE_NOTES: Note[] = [
  {
    id: "1",
    title: "Welcome to Clove",
    body: "Clove is a minimal note-taking app. Start writing your thoughts here.",
    updatedAt: new Date(),
  },
  {
    id: "2",
    title: "Getting Started",
    body: "Click on a note in the sidebar to open it. Use the + button to create a new note.",
    updatedAt: new Date(Date.now() - 3600000),
  },
  {
    id: "3",
    title: "Keyboard Shortcuts",
    body: "More shortcuts coming soon.",
    updatedAt: new Date(Date.now() - 86400000),
  },
];

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function App() {
  const [notes] = useState<Note[]>(SAMPLE_NOTES);
  const [activeId, setActiveId] = useState<string>("1");

  const activeNote = notes.find((n) => n.id === activeId);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Clove</h1>
          <button className="new-note-btn" title="New note">+</button>
        </div>

        <div className="search-wrapper">
          <input
            type="text"
            className="search"
            placeholder="Search notes..."
          />
        </div>

        <nav className="notes-list">
          {notes.map((note) => (
            <button
              key={note.id}
              className={`note-item ${note.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(note.id)}
            >
              <span className="note-item-title">{note.title}</span>
              <span className="note-item-meta">
                {formatTime(note.updatedAt)}
              </span>
            </button>
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
                value={activeNote.title}
                readOnly
              />
            </div>
            <textarea
              className="editor-body"
              value={activeNote.body}
              readOnly
            />
          </>
        ) : (
          <div className="editor-empty">
            <p>Select a note or create a new one</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
