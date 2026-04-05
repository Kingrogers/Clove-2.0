import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import BlockEditor from "./BlockEditor";
import ChatPanel from "./ChatPanel";
import TasksView from "./TasksView";
import AiPromptBar from "./AiPromptBar";
import HomeView from "./HomeView";
import NotesView from "./NotesView";
import "./App.css";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  folderId?: string;
}

interface Folder {
  id: string;
  name: string;
  createdAt: number;
  color?: string;
  favorite?: boolean;
  noteSort?: "az" | "za" | "newest" | "oldest";
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState<"home" | "notes" | "tasks">("home");
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      invoke<Note[]>("list_notes"),
      invoke<Folder[]>("list_folders"),
    ]).then(([diskNotes, diskFolders]) => {
      setFolders(diskFolders);
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
      folderId: activeFolderId ?? undefined,
    };
    invoke("save_note", { note });
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, [activeFolderId]);

  const createFolder = useCallback((name: string) => {
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };
    invoke("save_folder", { folder });
    setFolders((prev) =>
      [...prev, folder].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      )
    );
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFolders((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      const updated = { ...target, name: trimmed };
      invoke("save_folder", { folder: updated });
      return prev
        .map((f) => (f.id === id ? updated : f))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    });
  }, []);

  const updateFolder = useCallback((id: string, patch: Partial<Folder>) => {
    setFolders((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      const updated = { ...target, ...patch };
      invoke("save_folder", { folder: updated });
      return prev.map((f) => (f.id === id ? updated : f));
    });
  }, []);

  const setFolderColor = useCallback(
    (id: string, color: string) => {
      updateFolder(id, { color: color === "default" ? undefined : color });
    },
    [updateFolder]
  );

  const toggleFolderFavorite = useCallback(
    (id: string) => {
      setFolders((prev) => {
        const target = prev.find((f) => f.id === id);
        if (!target) return prev;
        const updated = { ...target, favorite: !target.favorite || undefined };
        // Normalize: undefined when false so it's not persisted
        if (!updated.favorite) delete updated.favorite;
        invoke("save_folder", { folder: updated });
        return prev.map((f) => (f.id === id ? updated : f));
      });
    },
    []
  );

  const setFolderNoteSort = useCallback(
    (id: string, sort: "az" | "za" | "newest" | "oldest") => {
      updateFolder(id, { noteSort: sort });
    },
    [updateFolder]
  );

  const duplicateFolder = useCallback(
    (id: string) => {
      const src = folders.find((f) => f.id === id);
      if (!src) return;
      const copy: Folder = {
        id: crypto.randomUUID(),
        name: `${src.name} (copy)`,
        createdAt: Date.now(),
        color: src.color,
        noteSort: src.noteSort,
      };
      invoke("save_folder", { folder: copy });

      // Clone notes inside
      const insideNotes = notes.filter((n) => n.folderId === id);
      const cloned: Note[] = insideNotes.map((n) => ({
        id: crypto.randomUUID(),
        title: n.title,
        body: n.body,
        updatedAt: Date.now(),
        folderId: copy.id,
      }));
      cloned.forEach((n) => invoke("save_note", { note: n }));

      setFolders((prev) =>
        [...prev, copy].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        )
      );
      setNotes((prev) => [...cloned, ...prev]);
    },
    [folders, notes]
  );

  const deleteFolder = useCallback((id: string) => {
    invoke("delete_folder", { id });
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setNotes((prev) =>
      prev.map((n) => (n.folderId === id ? { ...n, folderId: undefined } : n))
    );
    if (activeFolderId === id) setActiveFolderId(null);
  }, [activeFolderId]);

  const assignNoteFolder = useCallback(
    (noteId: string, folderId: string | null) => {
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== noteId) return n;
          const updated = {
            ...n,
            folderId: folderId ?? undefined,
            updatedAt: Date.now(),
          };
          invoke("save_note", { note: updated });
          return updated;
        });
        return next;
      });
    },
    []
  );

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

  const runAiEdit = useCallback(async (prompt: string) => {
    const target = notes.find((n) => n.id === activeId);
    if (!target) return;
    setAiPromptOpen(false);
    setAiError(null);
    setAiEditing(true);
    const targetId = target.id;
    try {
      const newBody = await invoke<string>("ai_edit_note", {
        title: target.title,
        body: target.body,
        prompt,
      });
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== targetId) return n;
          const updated = { ...n, body: newBody, updatedAt: Date.now() };
          invoke("save_note", { note: updated });
          return updated;
        });
        return next;
      });
      if (targetId === activeId) {
        setContentVersion((v) => v + 1);
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiEditing(false);
    }
  }, [notes, activeId]);

  // ⌘K opens the AI prompt bar (when editing a note)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (view === "notes" && activeId) {
          setAiPromptOpen((o) => !o);
        }
      } else if (e.key === "Escape" && aiPromptOpen) {
        setAiPromptOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, activeId, aiPromptOpen]);

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

  const visibleNotes = activeFolderId
    ? notes.filter((n) => n.folderId === activeFolderId)
    : notes;
  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null;
  const noteSort = activeFolder?.noteSort ?? "newest";
  const sorted = [...visibleNotes].sort((a, b) => {
    switch (noteSort) {
      case "az":
        return (a.title || "Untitled").toLowerCase().localeCompare(
          (b.title || "Untitled").toLowerCase()
        );
      case "za":
        return (b.title || "Untitled").toLowerCase().localeCompare(
          (a.title || "Untitled").toLowerCase()
        );
      case "oldest":
        return a.updatedAt - b.updatedAt;
      case "newest":
      default:
        return b.updatedAt - a.updatedAt;
    }
  });
  const pinnedFolders = folders.filter((f) => f.favorite);

  const openNoteFromHome = useCallback((id: string) => {
    setActiveId(id);
    setActiveFolderId(null);
    setView("notes");
  }, []);

  const openFolderFromHome = useCallback(
    (id: string) => {
      setActiveFolderId(id);
      const first = notes.find((n) => n.folderId === id);
      setActiveId(first?.id ?? null);
      setView("notes");
    },
    [notes]
  );

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
            className={`view-tab ${view === "home" ? "active" : ""}`}
            onClick={() => setView("home")}
          >
            Home
          </button>
          <button
            className={`view-tab ${view === "notes" ? "active" : ""}`}
            onClick={() => {
              setView("notes");
              setActiveId(null);
            }}
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

        {pinnedFolders.length > 0 && (
          <div className="pinned-folders">
            <div className="pinned-folders-label">Pinned</div>
            {pinnedFolders.map((f) => (
              <button
                key={f.id}
                className={`pinned-folder-item ${
                  activeFolderId === f.id && view === "notes" ? "active" : ""
                }`}
                onClick={() => openFolderFromHome(f.id)}
                title={f.name}
              >
                <span
                  className="pinned-folder-dot"
                  data-color={f.color ?? "default"}
                />
                <span className="pinned-folder-name">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        {view === "notes" && (
          <>
            {activeFolder && (
              <div className="folder-filter-bar">
                <span className="folder-filter-name">📁 {activeFolder.name}</span>
                <button
                  className="folder-filter-clear"
                  onClick={() => setActiveFolderId(null)}
                  title="Show all notes"
                >
                  &times;
                </button>
              </div>
            )}
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

      {view === "home" && (
        <HomeView
          notes={notes}
          folders={folders}
          onOpenNote={openNoteFromHome}
        />
      )}

      {view === "notes" && !activeNote && (
        <NotesView
          folders={folders}
          notes={notes}
          activeFolderId={activeFolderId}
          onOpenNote={openNoteFromHome}
          onOpenFolder={openFolderFromHome}
          onCreateFolder={createFolder}
          onCreateNote={createNote}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onSetFolderColor={(id, color) => setFolderColor(id, color)}
          onToggleFolderFavorite={toggleFolderFavorite}
          onSetFolderNoteSort={(id, sort) => setFolderNoteSort(id, sort)}
          onDuplicateFolder={duplicateFolder}
        />
      )}

      {view === "notes" && activeNote && (
        <>
          <main className="editor">
            <div className="editor-header">
              <button
                className="editor-back-btn"
                onClick={() => setActiveId(null)}
                title="Back to notes"
              >
                ← Back
              </button>
              <input
                type="text"
                className="editor-title"
                placeholder="Untitled"
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, "title", e.target.value)}
              />
              <select
                className="folder-select"
                value={activeNote.folderId ?? ""}
                onChange={(e) =>
                  assignNoteFolder(activeNote.id, e.target.value || null)
                }
                title="Folder"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                className="ai-cmdk-btn"
                onClick={() => setAiPromptOpen(true)}
                title="AI edit (⌘K)"
              >
                <span className="ai-cmdk-label">AI</span>
                <span className="ai-cmdk-kbd">⌘K</span>
              </button>
              <button
                className={`ai-toggle ${chatOpen ? "active" : ""}`}
                onClick={() => setChatOpen((o) => !o)}
                title="Toggle AI chat panel"
              >
                Chat
              </button>
            </div>
            <BlockEditor
              key={activeNote.id}
              noteId={activeNote.id}
              content={activeNote.body}
              contentVersion={contentVersion}
              notes={notes}
              onChange={(md) => updateNote(activeNote.id, "body", md)}
              onNoteLinkClick={(id) => setActiveId(id)}
            />
          </main>

          {chatOpen && activeNote && (
            <ChatPanel
              noteTitle={activeNote.title}
              noteBody={activeNote.body}
            />
          )}
        </>
      )}

      {view === "tasks" && <TasksView />}

      {aiPromptOpen && activeNote && (
        <AiPromptBar
          onSubmit={runAiEdit}
          onClose={() => setAiPromptOpen(false)}
        />
      )}

      {aiEditing && (
        <div className="ai-status-pill">
          <div className="ai-status-spinner" />
          <span>AI editing note…</span>
        </div>
      )}

      {aiError && !aiEditing && (
        <div className="ai-status-pill ai-status-error" onClick={() => setAiError(null)}>
          <span>AI error: {aiError}</span>
          <span className="ai-status-dismiss">×</span>
        </div>
      )}
    </div>
  );
}

export default App;
