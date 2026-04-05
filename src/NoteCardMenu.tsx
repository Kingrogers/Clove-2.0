import { useEffect, useRef, useState, useMemo } from "react";

interface Folder {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  favorite: boolean;
  currentFolderId: string | null;
  folders: Folder[];
  onClose: () => void;
  onToggleFavorite: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function StarIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5 L10 5.8 L14.8 6.4 L11.3 9.8 L12.2 14.5 L8 12.2 L3.8 14.5 L4.7 9.8 L1.2 6.4 L6 5.8 Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 1.5 L10 5.8 L14.8 6.4 L11.3 9.8 L12.2 14.5 L8 12.2 L3.8 14.5 L4.7 9.8 L1.2 6.4 L6 5.8 Z" />
    </svg>
  );
}

function FolderMoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5 A1 1 0 0 1 3 3.5 H6 L7.5 5 H13 A1 1 0 0 1 14 6 V12 A1 1 0 0 1 13 13 H3 A1 1 0 0 1 2 12 Z" />
      <path d="M6.5 8.5 L10 8.5" />
      <path d="M8.5 7 L10 8.5 L8.5 10" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5 V3 A1 1 0 0 0 10 2 H3 A1 1 0 0 0 2 3 V10 A1 1 0 0 0 3 11 H5" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5 H13" />
      <path d="M6 4.5 V3 A1 1 0 0 1 7 2 H9 A1 1 0 0 1 10 3 V4.5" />
      <path d="M4.5 4.5 L5 13 A1 1 0 0 0 6 14 H10 A1 1 0 0 0 11 13 L11.5 4.5" />
      <path d="M6.5 7 V11.5" />
      <path d="M9.5 7 V11.5" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.15s",
        flexShrink: 0,
      }}
    >
      <path d="M4 2.5 L8 6 L4 9.5" />
    </svg>
  );
}

export default function NoteCardMenu({
  favorite,
  currentFolderId,
  folders,
  onClose,
  onToggleFavorite,
  onMoveToFolder,
  onDuplicate,
  onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (moveOpen) {
          setMoveOpen(false);
          return;
        }
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, moveOpen]);

  const filteredFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, folderQuery]);

  const handleMove = (folderId: string | null) => {
    onMoveToFolder(folderId);
    setMoveOpen(false);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="note-menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="note-menu-item"
        onClick={() => {
          onToggleFavorite();
          onClose();
        }}
      >
        <span className={`note-menu-icon ${favorite ? "favorited" : ""}`}>
          <StarIcon filled={favorite} />
        </span>
        <span>{favorite ? "Unfavorite" : "Favorite"}</span>
      </button>

      <button
        className={`note-menu-item ${moveOpen ? "open" : ""}`}
        onClick={() => setMoveOpen((o) => !o)}
      >
        <span className="note-menu-icon">
          <FolderMoveIcon />
        </span>
        <span className="note-menu-label">Move to folder</span>
        <ChevronIcon open={moveOpen} />
      </button>

      {moveOpen && (
        <div className="note-menu-sub">
          <input
            type="text"
            className="note-menu-sub-search"
            placeholder="Search folders…"
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredFolders.length > 0) {
                handleMove(filteredFolders[0].id);
              }
            }}
          />
          <div className="note-menu-sub-list">
            <button
              className={`note-menu-sub-item ${currentFolderId === null ? "selected" : ""}`}
              onClick={() => handleMove(null)}
            >
              <span className="note-menu-sub-dot" data-color="default" />
              <span className="note-menu-sub-name">No folder (Unfiled)</span>
              {currentFolderId === null && (
                <span className="note-menu-sub-check">✓</span>
              )}
            </button>
            {filteredFolders.length === 0 ? (
              <div className="note-menu-sub-empty">No folders match</div>
            ) : (
              filteredFolders.map((f) => (
                <button
                  key={f.id}
                  className={`note-menu-sub-item ${currentFolderId === f.id ? "selected" : ""}`}
                  onClick={() => handleMove(f.id)}
                >
                  <span
                    className="note-menu-sub-dot"
                    data-color={f.color ?? "default"}
                  />
                  <span className="note-menu-sub-name">{f.name}</span>
                  {currentFolderId === f.id && (
                    <span className="note-menu-sub-check">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <button
        className="note-menu-item"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        <span className="note-menu-icon">
          <DuplicateIcon />
        </span>
        <span>Duplicate</span>
      </button>

      <div className="note-menu-separator" />

      <button
        className={`note-menu-item danger ${confirmingDelete ? "confirming" : ""}`}
        onClick={() => {
          if (!confirmingDelete) {
            setConfirmingDelete(true);
            if (confirmTimer.current) clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
            return;
          }
          if (confirmTimer.current) clearTimeout(confirmTimer.current);
          onDelete();
          onClose();
        }}
      >
        <span className="note-menu-icon">
          <DeleteIcon />
        </span>
        <span>{confirmingDelete ? "Tap again to confirm" : "Delete"}</span>
      </button>
    </div>
  );
}
