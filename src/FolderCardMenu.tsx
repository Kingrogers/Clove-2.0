import { useEffect, useRef, useState } from "react";

export type FolderColor =
  | "default"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green";

export type NoteSort = "az" | "za" | "newest" | "oldest";

export const FOLDER_COLORS: { id: FolderColor; swatch: string; dot: string }[] = [
  { id: "default", swatch: "linear-gradient(135deg,#fafbfd,#d8dde6)", dot: "#d8dde6" },
  { id: "blue", swatch: "linear-gradient(135deg,#a8c4ff,#4374e4)", dot: "#4374e4" },
  { id: "purple", swatch: "linear-gradient(135deg,#d8a8ff,#9333ea)", dot: "#9333ea" },
  { id: "pink", swatch: "linear-gradient(135deg,#ffb3d4,#ec4899)", dot: "#ec4899" },
  { id: "red", swatch: "linear-gradient(135deg,#ffb4b4,#ef4444)", dot: "#ef4444" },
  { id: "orange", swatch: "linear-gradient(135deg,#ffcb9c,#f97316)", dot: "#f97316" },
  { id: "yellow", swatch: "linear-gradient(135deg,#ffe58a,#eab308)", dot: "#eab308" },
  { id: "green", swatch: "linear-gradient(135deg,#a7e7b6,#16a34a)", dot: "#16a34a" },
];

interface Props {
  folderName: string;
  noteCount: number;
  sizeLabel: string;
  color: FolderColor;
  favorite: boolean;
  noteSort: NoteSort;
  onClose: () => void;
  onRename: () => void;
  onChangeColor: (color: FolderColor) => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onSetNoteSort: (sort: NoteSort) => void;
  onDelete: () => void;
}

const SORT_LABELS: { id: NoteSort; label: string }[] = [
  { id: "az", label: "A – Z" },
  { id: "za", label: "Z – A" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

export default function FolderCardMenu({
  folderName,
  noteCount,
  sizeLabel,
  color,
  favorite,
  noteSort,
  onClose,
  onRename,
  onChangeColor,
  onDuplicate,
  onToggleFavorite,
  onSetNoteSort,
  onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
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
      if (e.key === "Escape") onClose();
    };
    // Defer binding so the click that opened the menu doesn't close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="folder-menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="folder-menu-item"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        <span>Rename folder</span>
        <span className="folder-menu-icon">✎</span>
      </button>

      <div className="folder-menu-separator" />

      <div className="folder-menu-section">
        <div className="folder-menu-swatches">
          {FOLDER_COLORS.map((c) => (
            <button
              key={c.id}
              className={`folder-swatch ${color === c.id ? "selected" : ""}`}
              style={{ background: c.dot }}
              title={c.id.charAt(0).toUpperCase() + c.id.slice(1)}
              data-color={c.id}
              onClick={() => onChangeColor(c.id)}
            />
          ))}
        </div>
      </div>

      <div className="folder-menu-separator" />

      <button
        className="folder-menu-item"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        <span>Duplicate folder</span>
        <span className="folder-menu-icon">⎘</span>
      </button>

      <button
        className="folder-menu-item"
        onClick={() => {
          onToggleFavorite();
        }}
      >
        <span>{favorite ? "Unpin from sidebar" : "Pin to sidebar"}</span>
        <span className={`folder-menu-icon ${favorite ? "favorited" : ""}`}>
          {favorite ? "★" : "☆"}
        </span>
      </button>

      <div className="folder-menu-separator" />

      <div className="folder-menu-section">
        <div className="folder-menu-section-label">Sort notes</div>
        <div className="folder-menu-chips">
          {SORT_LABELS.map((s) => (
            <button
              key={s.id}
              className={`folder-menu-chip ${noteSort === s.id ? "selected" : ""}`}
              onClick={() => onSetNoteSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="folder-menu-separator" />

      <div className="folder-menu-info">
        <div className="folder-menu-info-row">
          <span className="folder-menu-info-key">Notes</span>
          <span className="folder-menu-info-val">{noteCount}</span>
        </div>
        <div className="folder-menu-info-row">
          <span className="folder-menu-info-key">Size</span>
          <span className="folder-menu-info-val">{sizeLabel}</span>
        </div>
        <div className="folder-menu-info-name" title={folderName}>
          {folderName}
        </div>
      </div>

      <div className="folder-menu-separator" />

      <button
        className={`folder-menu-item danger ${confirmingDelete ? "confirming" : ""}`}
        onClick={() => {
          if (!confirmingDelete) {
            setConfirmingDelete(true);
            if (confirmTimer.current) clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => {
              setConfirmingDelete(false);
            }, 3000);
            return;
          }
          if (confirmTimer.current) clearTimeout(confirmTimer.current);
          onDelete();
          onClose();
        }}
      >
        <span>{confirmingDelete ? "Tap again to confirm" : "Delete folder"}</span>
        <span className="folder-menu-icon">🗑</span>
      </button>
    </div>
  );
}
