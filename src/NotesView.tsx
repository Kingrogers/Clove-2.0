import { useState, useRef, useEffect } from "react";
import FolderCardMenu, {
  FOLDER_COLORS,
  FolderColor,
  NoteSort,
} from "./FolderCardMenu";
import NoteCardMenu from "./NoteCardMenu";

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
  createdAt: number;
  color?: string;
  favorite?: boolean;
  order?: number;
  noteSort?: NoteSort;
}

interface Props {
  folders: Folder[];
  notes: Note[];
  activeFolderId: string | null;
  onOpenNote: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onSetFolderColor: (id: string, color: FolderColor) => void;
  onSetFolderNoteSort: (id: string, sort: NoteSort) => void;
  onDuplicateFolder: (id: string) => void;
  onToggleNoteFavorite: (id: string) => void;
  onMoveNoteToFolder: (id: string, folderId: string | null) => void;
  onDuplicateNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onReorderFolders: (nextIds: string[]) => void;
  onReorderPinnedNotes: (nextIds: string[]) => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function snippet(body: string, n = 120): string {
  const clean = body
    .replace(/^#+\s+/gm, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>]/g, "")
    .trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function folderStats(folderId: string, notes: Note[]): { count: number; size: number; lastUpdated: number } {
  const inFolder = notes.filter((n) => n.folderId === folderId);
  const size = inFolder.reduce(
    (sum, n) => sum + new Blob([n.title + n.body]).size,
    0
  );
  const lastUpdated = inFolder.reduce((max, n) => Math.max(max, n.updatedAt), 0);
  return { count: inFolder.length, size, lastUpdated };
}

function gradientFor(color: string | undefined): string | undefined {
  if (!color || color === "default") return undefined;
  const preset = FOLDER_COLORS.find((c) => c.id === color);
  return preset?.swatch;
}

export default function NotesView({
  folders,
  notes,
  activeFolderId,
  onOpenNote,
  onOpenFolder,
  onCreateFolder,
  onCreateNote,
  onDeleteFolder,
  onRenameFolder,
  onSetFolderColor,
  onSetFolderNoteSort,
  onDuplicateFolder,
  onToggleNoteFavorite,
  onMoveNoteToFolder,
  onDuplicateNote,
  onDeleteNote,
  onReorderFolders,
  onReorderPinnedNotes,
}: Props) {
  const [noteMenuOpenId, setNoteMenuOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [noteSort, setNoteSort] = useState<NoteSort>("newest");
  const [noteFolderFilter, setNoteFolderFilter] = useState<string>("all");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const filteredNotes = notes.filter((n) =>
    noteFolderFilter === "all"
      ? true
      : noteFolderFilter === "unfiled"
      ? !n.folderId
      : n.folderId === noteFolderFilter
  );

  const pinnedNotes = [...filteredNotes]
    .filter((n) => n.favorite)
    .sort((a, b) => {
      const ao = a.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return b.updatedAt - a.updatedAt;
    });

  const regularNotes = filteredNotes.filter((n) => !n.favorite);

  const sortedNotes = [...regularNotes].sort((a, b) => {
    switch (noteSort) {
      case "oldest":
        return a.updatedAt - b.updatedAt;
      case "az":
        return (a.title || "Untitled")
          .toLowerCase()
          .localeCompare((b.title || "Untitled").toLowerCase());
      case "za":
        return (b.title || "Untitled")
          .toLowerCase()
          .localeCompare((a.title || "Untitled").toLowerCase());
      case "newest":
      default:
        return b.updatedAt - a.updatedAt;
    }
  });

  const recent = sortedNotes.slice(0, 12);

  // Ordered by saved `order`, then alphabetical
  const sortedFolders = [...folders].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const submitNew = () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName("");
      return;
    }
    onCreateFolder(name);
    setNewName("");
    setCreating(false);
  };

  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = () => {
    if (renamingId) {
      onRenameFolder(renamingId, renameValue);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  // ── Drag-and-drop helpers ──
  const dragKindRef = useRef<"folder" | "pin" | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Insert-before semantics: drop-on-target inserts the dragged item
  // just before the target in the final list. This matches the visual
  // indicator (a line drawn on the target's leading edge).
  const moveInArray = (arr: string[], from: number, to: number): string[] => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    const insertAt = from < to ? to - 1 : to;
    copy.splice(insertAt, 0, item);
    return copy;
  };

  const handleFolderDragStart = (id: string) => (e: React.DragEvent) => {
    dragKindRef.current = "folder";
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  };
  const handleFolderDragOver = (id: string) => (e: React.DragEvent) => {
    if (dragKindRef.current !== "folder") return;
    if (dragIdRef.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  };
  const handleFolderDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdRef.current;
    if (dragKindRef.current !== "folder" || !from || from === id) {
      handleDragEnd();
      return;
    }
    const ids = sortedFolders.map((f) => f.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      onReorderFolders(moveInArray(ids, fromIdx, toIdx));
    }
    handleDragEnd();
  };
  const handleDragEnd = () => {
    dragKindRef.current = null;
    dragIdRef.current = null;
    setDragId(null);
    setDragOverId(null);
  };

  const handlePinDragStart = (id: string) => (e: React.DragEvent) => {
    dragKindRef.current = "pin";
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  };
  const handlePinDragOver = (id: string) => (e: React.DragEvent) => {
    if (dragKindRef.current !== "pin") return;
    if (dragIdRef.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  };
  const handlePinDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdRef.current;
    if (dragKindRef.current !== "pin" || !from || from === id) {
      handleDragEnd();
      return;
    }
    const ids = pinnedNotes.map((n) => n.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      onReorderPinnedNotes(moveInArray(ids, fromIdx, toIdx));
    }
    handleDragEnd();
  };

  return (
    <main className="home-view">
      <div className="home-header">
        <h1 className="home-title">Notes</h1>
      </div>

      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Folders</h2>
        </div>

        <div className="folder-grid">
          {creating && (
            <div className="folder-card folder-card-new">
              <input
                className="folder-new-input"
                type="text"
                placeholder="Folder name"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNew();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                onBlur={submitNew}
              />
            </div>
          )}

          {sortedFolders.map((f) => {
            const { count, size } = folderStats(f.id, notes);
            const isActive = f.id === activeFolderId;
            const isRenaming = renamingId === f.id;
            const menuOpen = menuOpenId === f.id;
            const gradient = gradientFor(f.color);
            const colored = !!gradient;
            const cardStyle = gradient
              ? ({ ["--folder-gradient" as string]: gradient } as React.CSSProperties)
              : undefined;
            const previewNotes = notes
              .filter((n) => n.folderId === f.id)
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 2);
            const isDragOver = dragOverId === f.id;
            const isDragging = dragId === f.id;
            return (
              <div
                key={f.id}
                className={`folder-card ${isActive ? "active" : ""} ${colored ? "colored" : ""} ${menuOpen ? "menu-open" : ""} ${isDragging ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`}
                style={cardStyle}
                draggable={!isRenaming && !menuOpen}
                onDragStart={handleFolderDragStart(f.id)}
                onDragOver={handleFolderDragOver(f.id)}
                onDrop={handleFolderDrop(f.id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (isRenaming || menuOpen) return;
                  onOpenFolder(f.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(f);
                }}
              >
                <div className="folder-visual">
                  <div className="folder-icon-papers">
                    {previewNotes.map((n) => (
                      <div key={n.id} className="folder-icon-paper">
                        {n.title || "Untitled"}
                      </div>
                    ))}
                  </div>
                  <div className="folder-icon" />
                </div>

                {isRenaming ? (
                  <input
                    ref={renameRef}
                    className="folder-rename-input"
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <>
                    <div className="folder-card-title">{f.name}</div>
                    <div className="folder-card-meta">
                      {count} {count === 1 ? "note" : "notes"}
                    </div>
                    <div className="folder-card-size">{formatSize(size)}</div>
                  </>
                )}

                <button
                  className={`folder-menu-btn ${menuOpen ? "open" : ""}`}
                  title="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (menuOpen) {
                      menuAnchorRef.current = null;
                      setMenuOpenId(null);
                    } else {
                      menuAnchorRef.current = e.currentTarget;
                      setMenuOpenId(f.id);
                    }
                  }}
                >
                  ⋯
                </button>

                {menuOpen && (
                  <FolderCardMenu
                    anchorEl={menuAnchorRef.current}
                    folderName={f.name}
                    noteCount={count}
                    sizeLabel={formatSize(size)}
                    color={(f.color as FolderColor) || "default"}
                    noteSort={f.noteSort || "newest"}
                    onClose={() => {
                      menuAnchorRef.current = null;
                      setMenuOpenId(null);
                    }}
                    onRename={() => startRename(f)}
                    onChangeColor={(c) => onSetFolderColor(f.id, c)}
                    onDuplicate={() => onDuplicateFolder(f.id)}
                    onSetNoteSort={(s) => onSetFolderNoteSort(f.id, s)}
                    onDelete={() => onDeleteFolder(f.id)}
                  />
                )}
              </div>
            );
          })}

          {!creating && (
            <button
              className="folder-card folder-card-add"
              onClick={() => setCreating(true)}
              title="New folder"
            >
              <span className="card-add-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7.5 A1.5 1.5 0 0 1 4.5 6 H9.5 L11.5 8 H19.5 A1.5 1.5 0 0 1 21 9.5 V17.5 A1.5 1.5 0 0 1 19.5 19 H4.5 A1.5 1.5 0 0 1 3 17.5 Z"/>
                </svg>
              </span>
              <span className="card-add-label">New folder</span>
            </button>
          )}
        </div>
      </section>

      <div className="home-divider" role="separator" />

      <section className="home-section home-section-notes">
        <div className="home-section-header">
          <h2 className="home-section-title">Notes</h2>
          <div className="notes-filters">
            <select
              className="notes-filter-select"
              value={noteFolderFilter}
              onChange={(e) => setNoteFolderFilter(e.target.value)}
              title="Filter by folder"
            >
              <option value="all">All folders</option>
              <option value="unfiled">Unfiled</option>
              {sortedFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="notes-sort-chips">
              {(
                [
                  { id: "newest", label: "Newest" },
                  { id: "oldest", label: "Oldest" },
                  { id: "az", label: "A–Z" },
                  { id: "za", label: "Z–A" },
                ] as { id: NoteSort; label: string }[]
              ).map((s) => (
                <button
                  key={s.id}
                  className={`notes-sort-chip ${noteSort === s.id ? "selected" : ""}`}
                  onClick={() => setNoteSort(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {pinnedNotes.length > 0 && (
          <div className="pinned-notes-section">
            <div className="pinned-notes-label">Pinned</div>
            <div className="note-grid pinned-grid">
              {pinnedNotes.map((note) => {
                const folder = note.folderId
                  ? folders.find((f) => f.id === note.folderId)
                  : null;
                const menuOpen = noteMenuOpenId === note.id;
                const isDragging = dragId === note.id;
                const isDragOver = dragOverId === note.id;
                return (
                  <div
                    key={note.id}
                    className={`note-card compact ${menuOpen ? "menu-open" : ""} ${isDragging ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`}
                    draggable={!menuOpen}
                    onDragStart={handlePinDragStart(note.id)}
                    onDragOver={handlePinDragOver(note.id)}
                    onDrop={handlePinDrop(note.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (menuOpen) return;
                      onOpenNote(note.id);
                    }}
                  >
                    <div className="note-card-top">
                      <span className="note-card-date">
                        {formatDate(note.updatedAt)}
                      </span>
                      {folder ? (
                        <span className="note-card-folder">{folder.name}</span>
                      ) : (
                        <span className="note-card-folder note-card-folder-empty">
                          Unfiled
                        </span>
                      )}
                    </div>
                    <div className="note-card-header">
                      <div className="note-card-title">
                        {note.title || "Untitled"}
                      </div>
                      <button
                        className={`note-card-menu-btn ${menuOpen ? "open" : ""}`}
                        title="More options"
                        aria-label="Note options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteMenuOpenId(menuOpen ? null : note.id);
                        }}
                      >
                        ⋯
                      </button>
                    </div>
                    <div className="note-card-footer">
                      <span className="note-card-time-icon" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="8" cy="8" r="6.2" />
                          <path d="M8 4.6 V8 L10.4 9.6" />
                        </svg>
                      </span>
                      <span className="note-card-time">
                        {formatTime(note.updatedAt)}
                      </span>
                    </div>
                    {menuOpen && (
                      <NoteCardMenu
                        favorite={true}
                        currentFolderId={note.folderId ?? null}
                        folders={folders}
                        onClose={() => setNoteMenuOpenId(null)}
                        onToggleFavorite={() => onToggleNoteFavorite(note.id)}
                        onMoveToFolder={(fid) => onMoveNoteToFolder(note.id, fid)}
                        onDuplicate={() => onDuplicateNote(note.id)}
                        onDelete={() => onDeleteNote(note.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="note-grid">
          {recent.map((note) => {
            const folder = note.folderId
              ? folders.find((f) => f.id === note.folderId)
              : null;
            const preview = snippet(note.body, 220);
            const menuOpen = noteMenuOpenId === note.id;
            return (
              <div
                key={note.id}
                className={`note-card ${menuOpen ? "menu-open" : ""}`}
                onClick={() => {
                  if (menuOpen) return;
                  onOpenNote(note.id);
                }}
              >
                <div className="note-card-top">
                  <span className="note-card-date">
                    {formatDate(note.updatedAt)}
                  </span>
                  {folder ? (
                    <span className="note-card-folder">{folder.name}</span>
                  ) : (
                    <span className="note-card-folder note-card-folder-empty">
                      Unfiled
                    </span>
                  )}
                </div>
                <div className="note-card-header">
                  <div className="note-card-title">
                    {note.title || "Untitled"}
                  </div>
                  <button
                    className={`note-card-menu-btn ${menuOpen ? "open" : ""}`}
                    title="More options"
                    aria-label="Note options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteMenuOpenId(menuOpen ? null : note.id);
                    }}
                  >
                    ⋯
                  </button>
                </div>
                <div className="note-card-divider" />
                <div className="note-card-body">
                  {preview || "No content"}
                </div>
                <div className="note-card-footer">
                  <span className="note-card-time-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="8" r="6.2" />
                      <path d="M8 4.6 V8 L10.4 9.6" />
                    </svg>
                  </span>
                  <span className="note-card-time">
                    {formatTime(note.updatedAt)}
                  </span>
                </div>

                {menuOpen && (
                  <NoteCardMenu
                    favorite={false}
                    currentFolderId={note.folderId ?? null}
                    folders={folders}
                    onClose={() => setNoteMenuOpenId(null)}
                    onToggleFavorite={() => onToggleNoteFavorite(note.id)}
                    onMoveToFolder={(fid) => onMoveNoteToFolder(note.id, fid)}
                    onDuplicate={() => onDuplicateNote(note.id)}
                    onDelete={() => onDeleteNote(note.id)}
                  />
                )}
              </div>
            );
          })}

          <button
            className="note-card note-card-add"
            onClick={onCreateNote}
            title="New note"
          >
            <span className="card-add-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4 H15 L19 8 V19 A1 1 0 0 1 18 20 H7 A1 1 0 0 1 6 19 V5 A1 1 0 0 1 7 4 Z" />
                <path d="M15 4 V8 H19" />
              </svg>
            </span>
            <span className="card-add-label">New note</span>
          </button>
        </div>

        {recent.length === 0 && pinnedNotes.length === 0 && notes.length > 0 && (
          <div className="recent-empty">No notes match the current filter.</div>
        )}
      </section>
    </main>
  );
}
