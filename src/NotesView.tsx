import { useState, useRef, useEffect } from "react";
import FolderCardMenu, {
  FOLDER_COLORS,
  FolderColor,
  NoteSort,
} from "./FolderCardMenu";

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
  onToggleFolderFavorite: (id: string) => void;
  onSetFolderNoteSort: (id: string, sort: NoteSort) => void;
  onDuplicateFolder: (id: string) => void;
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
  onToggleFolderFavorite,
  onSetFolderNoteSort,
  onDuplicateFolder,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [starAnim, setStarAnim] = useState<{ id: string; mode: "star" | "unstar" } | null>(null);
  const [noteSort, setNoteSort] = useState<NoteSort>("newest");
  const [noteFolderFilter, setNoteFolderFilter] = useState<string>("all");
  const renameRef = useRef<HTMLInputElement>(null);
  const starTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (starTimer.current) clearTimeout(starTimer.current);
    };
  }, []);

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

  const sortedNotes = [...filteredNotes].sort((a, b) => {
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

  // Pinned folders first, then alphabetical
  const sortedFolders = [...folders].sort((a, b) => {
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
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

  const handleStarClick = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    const willFav = !folder.favorite;
    if (starTimer.current) clearTimeout(starTimer.current);
    setStarAnim({ id: folder.id, mode: willFav ? "star" : "unstar" });
    starTimer.current = setTimeout(() => setStarAnim(null), 440);
    onToggleFolderFavorite(folder.id);
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
            const starAnimClass =
              starAnim?.id === f.id
                ? starAnim.mode === "star"
                  ? "anim-star"
                  : "anim-unstar"
                : "";

            return (
              <div
                key={f.id}
                className={`folder-card ${isActive ? "active" : ""} ${colored ? "colored" : ""} ${menuOpen ? "menu-open" : ""}`}
                style={cardStyle}
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
                  className={`folder-star-btn ${f.favorite ? "active" : ""} ${starAnimClass}`}
                  title={f.favorite ? "Unpin from sidebar" : "Pin to sidebar"}
                  onClick={(e) => handleStarClick(e, f)}
                >
                  {f.favorite ? "★" : "☆"}
                </button>

                <button
                  className={`folder-menu-btn ${menuOpen ? "open" : ""}`}
                  title="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpen ? null : f.id);
                  }}
                >
                  ⋯
                </button>

                {menuOpen && (
                  <FolderCardMenu
                    folderName={f.name}
                    noteCount={count}
                    sizeLabel={formatSize(size)}
                    color={(f.color as FolderColor) || "default"}
                    favorite={!!f.favorite}
                    noteSort={f.noteSort || "newest"}
                    onClose={() => setMenuOpenId(null)}
                    onRename={() => startRename(f)}
                    onChangeColor={(c) => onSetFolderColor(f.id, c)}
                    onDuplicate={() => onDuplicateFolder(f.id)}
                    onToggleFavorite={() => onToggleFolderFavorite(f.id)}
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

        <div className="note-grid">
          {recent.map((note) => {
            const folder = note.folderId
              ? folders.find((f) => f.id === note.folderId)
              : null;
            const preview = snippet(note.body, 220);
            return (
              <div
                key={note.id}
                className="note-card"
                onClick={() => onOpenNote(note.id)}
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
                  <span className="note-card-edit" aria-hidden="true">✎</span>
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

        {recent.length === 0 && notes.length > 0 && (
          <div className="recent-empty">No notes match the current filter.</div>
        )}
      </section>
    </main>
  );
}
