import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import BlockEditor from "./BlockEditor";
import ChatPanel from "./ChatPanel";
import TasksView from "./TasksView";
import AiPromptBar from "./AiPromptBar";
import HomeView from "./HomeView";
import NotesView from "./NotesView";
import GraphView from "./GraphView";
import PropertiesPanel, { CustomField } from "./PropertiesPanel";
import SidebarTree from "./SidebarTree";
import "./App.css";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  createdAt?: number;
  folderId?: string;
  favorite?: boolean;
  pinnedOrder?: number;
  description?: string;
  tags?: string[];
  customFields?: CustomField[];
}

interface Folder {
  id: string;
  name: string;
  createdAt: number;
  color?: string;
  favorite?: boolean;
  order?: number;
  noteSort?: "az" | "za" | "newest" | "oldest";
}

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [view, setView] = useState<"home" | "notes" | "tasks" | "graph">("home");
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("clove:sidebarWidth") : null;
    const n = saved ? parseInt(saved, 10) : 248;
    return Number.isFinite(n) ? Math.min(480, Math.max(180, n)) : 248;
  });
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const [propsGenerating, setPropsGenerating] = useState<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propsTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    Promise.all([
      invoke<Note[]>("list_notes"),
      invoke<Folder[]>("list_folders"),
    ]).then(([diskNotes, diskFolders]) => {
      setFolders(diskFolders);
      if (diskNotes.length === 0) {
        const now = Date.now();
        const welcome: Note = {
          id: crypto.randomUUID(),
          title: "Welcome to Clove",
          body: "Clove is a minimal note-taking app.\n\nStart writing your thoughts here.",
          updatedAt: now,
          createdAt: now,
        };
        invoke("save_note", { note: welcome }).then(() => {
          setNotes([welcome]);
          setActiveId(welcome.id);
          setLoaded(true);
        });
      } else {
        // Backfill createdAt for older notes so properties panel always has a value
        const migrated = diskNotes.map((n) =>
          n.createdAt == null ? { ...n, createdAt: n.updatedAt } : n
        );
        setNotes(migrated);
        setActiveId(migrated[0].id);
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

  const createNote = useCallback(
    (folderId?: string) => {
      const now = Date.now();
      const resolvedFolder = folderId ?? activeFolderId ?? undefined;
      const note: Note = {
        id: crypto.randomUUID(),
        title: "",
        body: "",
        updatedAt: now,
        createdAt: now,
        folderId: resolvedFolder,
      };
      invoke("save_note", { note });
      setNotes((prev) => [note, ...prev]);
      setActiveId(note.id);
    },
    [activeFolderId]
  );

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

  const reorderFolders = useCallback((nextIds: string[]) => {
    setFolders((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      const next = nextIds
        .map((id, i) => {
          const f = byId.get(id);
          if (!f) return null;
          const updated = { ...f, order: i };
          invoke("save_folder", { folder: updated });
          return updated;
        })
        .filter((f): f is Folder => f !== null);
      // Include any folders not in nextIds at the end
      for (const f of prev) {
        if (!nextIds.includes(f.id)) next.push(f);
      }
      return next;
    });
  }, []);

  const reorderPinnedNotes = useCallback((nextIds: string[]) => {
    setNotes((prev) => {
      return prev.map((n) => {
        const idx = nextIds.indexOf(n.id);
        if (idx === -1) return n;
        const updated = { ...n, pinnedOrder: idx };
        invoke("save_note", { note: updated });
        return updated;
      });
    });
  }, []);

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

  // Runs the AI property-extraction for a single note, persists the result,
  // and updates in-memory state. Silently no-ops on failures (best-effort).
  const runPropertiesGeneration = useCallback(async (noteId: string) => {
    const current = await new Promise<Note | null>((resolve) => {
      setNotes((prev) => {
        resolve(prev.find((n) => n.id === noteId) ?? null);
        return prev;
      });
    });
    if (!current) return;
    // Skip empty notes entirely
    if (!current.title.trim() && !current.body.trim()) return;
    setPropsGenerating((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      return next;
    });
    try {
      const props = await invoke<{ description: string; tags: string[] }>(
        "generate_note_properties",
        { title: current.title, body: current.body }
      );
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== noteId) return n;
          const updated: Note = {
            ...n,
            description: props.description || n.description,
            tags: props.tags && props.tags.length > 0 ? props.tags : n.tags,
          };
          invoke("save_note", { note: updated });
          return updated;
        });
        return next;
      });
    } catch {
      // best-effort; don't disrupt editing
    } finally {
      setPropsGenerating((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }
  }, []);

  // Schedule AI property extraction after the user pauses editing.
  const schedulePropertiesGeneration = useCallback(
    (noteId: string) => {
      const existing = propsTimers.current.get(noteId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        propsTimers.current.delete(noteId);
        runPropertiesGeneration(noteId);
      }, 3500);
      propsTimers.current.set(noteId, timer);
    },
    [runPropertiesGeneration]
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
    schedulePropertiesGeneration(id);
  }, [saveToDisk, schedulePropertiesGeneration]);

  // Property-panel mutations
  const removeTag = useCallback(
    (id: string, tag: string) => {
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== id) return n;
          const tags = (n.tags ?? []).filter((t) => t !== tag);
          const updated = { ...n, tags, updatedAt: Date.now() };
          invoke("save_note", { note: updated });
          return updated;
        });
        return next;
      });
    },
    []
  );

  const addCustomField = useCallback(
    (id: string, field: CustomField) => {
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== id) return n;
          const existing = n.customFields ?? [];
          if (existing.some((f) => f.key === field.key)) return n;
          const updated = {
            ...n,
            customFields: [...existing, field],
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

  const updateCustomField = useCallback(
    (id: string, key: string, value: string) => {
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== id) return n;
          const updated = {
            ...n,
            customFields: (n.customFields ?? []).map((f) =>
              f.key === key ? { ...f, value } : f
            ),
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

  const removeCustomField = useCallback(
    (id: string, key: string) => {
      setNotes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== id) return n;
          const updated = {
            ...n,
            customFields: (n.customFields ?? []).filter((f) => f.key !== key),
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

  // Cancel pending AI-property jobs on unmount
  useEffect(() => {
    const timers = propsTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

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

  const toggleNoteFavorite = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== id) return n;
        const updated: Note = { ...n, updatedAt: Date.now() };
        if (n.favorite) {
          delete updated.favorite;
        } else {
          updated.favorite = true;
        }
        invoke("save_note", { note: updated });
        return updated;
      });
      return next;
    });
  }, []);

  const duplicateNote = useCallback(
    (id: string) => {
      const src = notes.find((n) => n.id === id);
      if (!src) return;
      const now = Date.now();
      const copy: Note = {
        id: crypto.randomUUID(),
        title: src.title ? `${src.title} (copy)` : "",
        body: src.body,
        updatedAt: now,
        createdAt: now,
        folderId: src.folderId,
        description: src.description,
        tags: src.tags,
        customFields: src.customFields,
      };
      invoke("save_note", { note: copy });
      setNotes((prev) => [copy, ...prev]);
      setActiveId(copy.id);
    },
    [notes]
  );

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

  const openNoteFromHome = useCallback((id: string) => {
    setActiveId(id);
    setActiveFolderId(null);
    setView("notes");
  }, []);

  const startSidebarResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    sidebarResizeRef.current = { startX: e.clientX, startW: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const start = sidebarResizeRef.current;
      if (!start) return;
      const next = Math.min(480, Math.max(180, start.startW + (ev.clientX - start.startX)));
      setSidebarWidth(next);
    };
    const onUp = () => {
      sidebarResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem("clove:sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);

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
        <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
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
      <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div
          className="sidebar-resize-handle"
          onPointerDown={startSidebarResize}
          title="Drag to resize sidebar"
          aria-label="Resize sidebar"
        />
        <div className="sidebar-header">
          <h1 className="logo">Clove</h1>
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
          <button
            className={`view-tab ${view === "graph" ? "active" : ""}`}
            onClick={() => {
              setView("graph");
              setActiveId(null);
            }}
          >
            Graph
          </button>
        </div>

        {view === "notes" && (
          <SidebarTree
            notes={notes}
            folders={folders}
            activeId={activeId}
            onOpenNote={(id) => setActiveId(id)}
            onDeleteNote={deleteNote}
            onCreateNote={(folderId) => createNote(folderId)}
            onReorderFolders={reorderFolders}
            onReorderPinnedNotes={reorderPinnedNotes}
          />
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
          onSetFolderNoteSort={(id, sort) => setFolderNoteSort(id, sort)}
          onDuplicateFolder={duplicateFolder}
          onToggleNoteFavorite={toggleNoteFavorite}
          onMoveNoteToFolder={(id, fid) => assignNoteFolder(id, fid)}
          onDuplicateNote={duplicateNote}
          onDeleteNote={deleteNote}
          onReorderFolders={reorderFolders}
          onReorderPinnedNotes={reorderPinnedNotes}
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
                className={`ai-toggle ${propertiesOpen ? "active" : ""}`}
                onClick={() => setPropertiesOpen((o) => !o)}
                title="Toggle properties panel"
              >
                Properties
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

          {propertiesOpen && activeNote && (
            <PropertiesPanel
              createdAt={activeNote.createdAt}
              updatedAt={activeNote.updatedAt}
              description={activeNote.description}
              tags={activeNote.tags}
              customFields={activeNote.customFields}
              folderName={
                activeNote.folderId
                  ? folders.find((f) => f.id === activeNote.folderId)?.name ?? null
                  : null
              }
              generating={propsGenerating.has(activeNote.id)}
              onAddField={(f) => addCustomField(activeNote.id, f)}
              onRemoveField={(k) => removeCustomField(activeNote.id, k)}
              onUpdateField={(k, v) => updateCustomField(activeNote.id, k, v)}
              onRemoveTag={(t) => removeTag(activeNote.id, t)}
              onRegenerate={() => runPropertiesGeneration(activeNote.id)}
            />
          )}

          {chatOpen && activeNote && (
            <ChatPanel
              noteTitle={activeNote.title}
              noteBody={activeNote.body}
            />
          )}
        </>
      )}

      {view === "tasks" && <TasksView />}

      {view === "graph" && (
        <GraphView
          notes={notes}
          folders={folders}
          onOpenNote={openNoteFromHome}
        />
      )}

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
