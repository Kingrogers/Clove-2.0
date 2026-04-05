import { useState, useMemo, useEffect, useRef } from "react";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  folderId?: string;
  favorite?: boolean;
  pinnedOrder?: number;
}

interface Folder {
  id: string;
  name: string;
  color?: string;
  favorite?: boolean;
  order?: number;
}

interface Props {
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onCreateNote: (folderId?: string) => void;
  onReorderFolders: (nextIds: string[]) => void;
  onReorderPinnedNotes: (nextIds: string[]) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`tree-chevron ${open ? "open" : ""}`}
      aria-hidden="true"
    >
      <path d="M4 2.5 L8 6 L4 9.5" />
    </svg>
  );
}

function FolderGlyph({ color }: { color?: string }) {
  return (
    <span
      className="tree-folder-glyph"
      data-color={color ?? "default"}
      aria-hidden="true"
    >
      <svg viewBox="0 0 14 14" fill="currentColor" stroke="none">
        {/* Back tab */}
        <path d="M1.5 4 A1 1 0 0 1 2.5 3 H5 L6.5 4.5 H11.5 A1 1 0 0 1 12.5 5.5 V6 H1.5 Z" opacity="0.55" />
        {/* Body */}
        <path d="M1.5 5 H12.5 V10.5 A1 1 0 0 1 11.5 11.5 H2.5 A1 1 0 0 1 1.5 10.5 Z" />
      </svg>
    </span>
  );
}

function PageGlyph() {
  return (
    <span className="tree-page-glyph" aria-hidden="true">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2 H9 L11.5 4.5 V11.5 A0.5 0.5 0 0 1 11 12 H4 A0.5 0.5 0 0 1 3.5 11.5 V2.5 A0.5 0.5 0 0 1 4 2 Z" />
        <path d="M9 2 V4.5 H11.5" />
      </svg>
    </span>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.5 V9.5" />
      <path d="M2.5 6 H9.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M9.5 9.5 L12 12" />
    </svg>
  );
}

function BluePageGlyph() {
  return (
    <span className="tree-page-glyph tree-page-glyph-blue" aria-hidden="true">
      <svg viewBox="0 0 14 14" fill="currentColor" stroke="none">
        {/* Page body */}
        <path d="M4 2 H9 L11.5 4.5 V11.5 A0.5 0.5 0 0 1 11 12 H4 A0.5 0.5 0 0 1 3.5 11.5 V2.5 A0.5 0.5 0 0 1 4 2 Z" />
        {/* Folded corner highlight (slightly darker) */}
        <path d="M9 2 V4.5 H11.5 Z" opacity="0.55" />
      </svg>
    </span>
  );
}

export default function SidebarTree({
  notes,
  folders,
  activeId,
  onOpenNote,
  onDeleteNote,
  onCreateNote,
  onReorderFolders,
  onReorderPinnedNotes,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragPinId, setDragPinId] = useState<string | null>(null);
  const [dragOverPinId, setDragOverPinId] = useState<string | null>(null);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);

  // Expand folders that contain a favorite flag once folders load, and always
  // keep the folder containing the active note expanded.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of folders) {
        if (f.favorite) next.add(f.id);
      }
      return next;
    });
  }, [folders]);

  useEffect(() => {
    if (!activeId) return;
    const active = notes.find((n) => n.id === activeId);
    if (active?.folderId) {
      setExpanded((prev) => {
        if (prev.has(active.folderId!)) return prev;
        const next = new Set(prev);
        next.add(active.folderId!);
        return next;
      });
    }
  }, [activeId, notes]);

  const q = query.trim().toLowerCase();
  const matchesQuery = (n: Note) => {
    if (!q) return true;
    return (
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q)
    );
  };

  const sortNotes = (a: Note, b: Note) => {
    // Favorites first, then by most-recently updated
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  };

  const notesByFolder = useMemo(() => {
    const m = new Map<string, Note[]>();
    const sorted = [...notes].sort(sortNotes);
    for (const n of sorted) {
      if (n.folderId) {
        if (!m.has(n.folderId)) m.set(n.folderId, []);
        m.get(n.folderId)!.push(n);
      }
    }
    return m;
  }, [notes]);

  const unfiledNotes = useMemo(
    () => notes.filter((n) => !n.folderId).sort(sortNotes),
    [notes]
  );

  const pinnedNotes = useMemo(
    () =>
      notes
        .filter((n) => n.favorite)
        .sort((a, b) => {
          const ao = a.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
          const bo = b.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return b.updatedAt - a.updatedAt;
        }),
    [notes]
  );

  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [folders]);

  const dragKindRef = useRef<"folder" | "pin" | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const handleFolderDragStart = (id: string) => (e: React.DragEvent) => {
    dragKindRef.current = "folder";
    dragIdRef.current = id;
    setDragFolderId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  };
  const handleFolderDragOver = (id: string) => (e: React.DragEvent) => {
    if (dragKindRef.current !== "folder") return;
    if (dragIdRef.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverFolderId !== id) setDragOverFolderId(id);
  };
  const handleFolderDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdRef.current;
    if (dragKindRef.current !== "folder" || !from || from === id) {
      handleFolderDragEnd();
      return;
    }
    const ids = sortedFolders.map((f) => f.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const copy = [...ids];
      const [item] = copy.splice(fromIdx, 1);
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
      copy.splice(insertAt, 0, item);
      onReorderFolders(copy);
    }
    handleFolderDragEnd();
  };
  const handleFolderDragEnd = () => {
    dragKindRef.current = null;
    dragIdRef.current = null;
    setDragFolderId(null);
    setDragOverFolderId(null);
  };

  const handlePinDragStart = (id: string) => (e: React.DragEvent) => {
    dragKindRef.current = "pin";
    dragIdRef.current = id;
    setDragPinId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  };
  const handlePinDragOver = (id: string) => (e: React.DragEvent) => {
    if (dragKindRef.current !== "pin") return;
    if (dragIdRef.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverPinId !== id) setDragOverPinId(id);
  };
  const handlePinDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdRef.current;
    if (dragKindRef.current !== "pin" || !from || from === id) {
      handlePinDragEnd();
      return;
    }
    const ids = pinnedNotes.map((n) => n.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const copy = [...ids];
      const [item] = copy.splice(fromIdx, 1);
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
      copy.splice(insertAt, 0, item);
      onReorderPinnedNotes(copy);
    }
    handlePinDragEnd();
  };
  const handlePinDragEnd = () => {
    dragKindRef.current = null;
    dragIdRef.current = null;
    setDragPinId(null);
    setDragOverPinId(null);
  };

  // When searching, auto-expand folders with matches so results are visible.
  const searchExpanded = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const f of folders) {
      const inFolder = notesByFolder.get(f.id) ?? [];
      if (inFolder.some(matchesQuery)) set.add(f.id);
    }
    return set;
  }, [q, folders, notesByFolder]);

  const isExpanded = (id: string) =>
    searchExpanded ? searchExpanded.has(id) : expanded.has(id);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredUnfiled = unfiledNotes.filter(matchesQuery);

  return (
    <div className="sidebar-tree">
      <button
        className="tree-new-btn"
        onClick={() => onCreateNote()}
        title="New note"
      >
        <span className="tree-new-btn-icon"><PlusIcon /></span>
        <span className="tree-new-btn-label">New note</span>
        <span className="tree-kbd">
          <span>⌘</span>
          <span>N</span>
        </span>
      </button>

      <div className="tree-search">
        <span className="tree-search-icon"><SearchIcon /></span>
        <input
          type="text"
          className="tree-search-input"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="tree-search-clear"
            onClick={() => setQuery("")}
            title="Clear"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="tree-scroll">
        {pinnedNotes.length > 0 && (
          <div className="tree-section">
            <button
              className={`tree-row tree-section-toggle ${pinnedExpanded ? "open" : ""}`}
              onClick={() => setPinnedExpanded((o) => !o)}
            >
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`tree-chevron ${pinnedExpanded ? "open" : ""}`}
                aria-hidden="true"
              >
                <path d="M4 2.5 L8 6 L4 9.5" />
              </svg>
              <span className="tree-section-label tree-section-label-inline">
                Pinned
              </span>
              <span className="tree-row-count">{pinnedNotes.length}</span>
            </button>
            {pinnedExpanded && (
              <div className="tree-children tree-children-pinned">
                {pinnedNotes.filter(matchesQuery).map((n) => {
                  const isDragging = dragPinId === n.id;
                  const isDragOver = dragOverPinId === n.id;
                  return (
                    <button
                      key={`pin-${n.id}`}
                      className={`tree-row tree-note-row ${
                        n.id === activeId ? "active" : ""
                      } ${isDragging ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`}
                      draggable={true}
                      onDragStart={handlePinDragStart(n.id)}
                      onDragOver={handlePinDragOver(n.id)}
                      onDrop={handlePinDrop(n.id)}
                      onDragEnd={handlePinDragEnd}
                      onClick={() => onOpenNote(n.id)}
                    >
                      <BluePageGlyph />
                      <span className="tree-row-name">
                        {n.title || "Untitled"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {sortedFolders.length > 0 && (
          <div className="tree-section">
            <div className="tree-section-header">
              <span className="tree-section-label">Folders</span>
            </div>
            {sortedFolders.map((f) => {
              const folderNotes = notesByFolder.get(f.id) ?? [];
              const visibleNotes = folderNotes.filter(matchesQuery);
              if (q && visibleNotes.length === 0 && !f.name.toLowerCase().includes(q)) {
                return null;
              }
              const open = isExpanded(f.id);
              const isDragging = dragFolderId === f.id;
              const isDragOver = dragOverFolderId === f.id;
              return (
                <div
                  key={f.id}
                  className={`tree-folder ${isDragging ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`}
                  draggable={true}
                  onDragStart={handleFolderDragStart(f.id)}
                  onDragOver={handleFolderDragOver(f.id)}
                  onDrop={handleFolderDrop(f.id)}
                  onDragEnd={handleFolderDragEnd}
                >
                  <button
                    className={`tree-row tree-folder-row ${open ? "open" : ""}`}
                    onClick={() => toggleFolder(f.id)}
                  >
                    <ChevronIcon open={open} />
                    <FolderGlyph color={f.color} />
                    <span className="tree-row-name">{f.name}</span>
                    <span className="tree-row-count">{folderNotes.length}</span>
                    <button
                      className="tree-row-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!open) toggleFolder(f.id);
                        onCreateNote(f.id);
                      }}
                      title="New note in folder"
                      aria-label={`New note in ${f.name}`}
                    >
                      <PlusIcon />
                    </button>
                  </button>
                  {open && (
                    <div className="tree-children">
                      {visibleNotes.length === 0 ? (
                        <div className="tree-empty">No notes</div>
                      ) : (
                        visibleNotes.map((n) => (
                          <button
                            key={n.id}
                            className={`tree-row tree-note-row ${
                              n.id === activeId ? "active" : ""
                            } ${n.favorite ? "favorite" : ""}`}
                            onClick={() => onOpenNote(n.id)}
                          >
                            {n.favorite ? <BluePageGlyph /> : <PageGlyph />}
                            <span className="tree-row-name">
                              {n.title || "Untitled"}
                            </span>
                            <button
                              className="tree-row-action tree-row-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteNote(n.id);
                              }}
                              title="Delete note"
                              aria-label="Delete note"
                            >
                              ×
                            </button>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredUnfiled.length > 0 && (
          <div className="tree-section">
            <div className="tree-section-header">
              <span className="tree-section-label">Notes</span>
              <span className="tree-section-count">
                {unfiledNotes.length}
              </span>
            </div>
            {filteredUnfiled.map((n) => (
              <button
                key={n.id}
                className={`tree-row tree-note-row tree-note-top ${
                  n.id === activeId ? "active" : ""
                } ${n.favorite ? "favorite" : ""}`}
                onClick={() => onOpenNote(n.id)}
              >
                {n.favorite ? <BluePageGlyph /> : <PageGlyph />}
                <span className="tree-row-name">{n.title || "Untitled"}</span>
                <button
                  className="tree-row-action tree-row-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(n.id);
                  }}
                  title="Delete note"
                  aria-label="Delete note"
                >
                  ×
                </button>
              </button>
            ))}
          </div>
        )}

        {q && sortedFolders.every((f) => {
          const fn = notesByFolder.get(f.id) ?? [];
          return !fn.some(matchesQuery) && !f.name.toLowerCase().includes(q);
        }) && filteredUnfiled.length === 0 && (
          <div className="tree-empty tree-empty-global">
            No notes match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}
