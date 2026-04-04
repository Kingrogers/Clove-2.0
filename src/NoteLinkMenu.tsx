import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";

interface NoteRef {
  id: string;
  title: string;
}

interface Props {
  editor: Editor;
  notes: NoteRef[];
  query: string;
  position: { top: number; left: number };
  onSelect: () => void;
  onClose: () => void;
}

export default function NoteLinkMenu({
  editor,
  notes,
  query,
  position,
  onSelect,
  onClose,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const q = query.toLowerCase();
  const filtered = notes
    .filter((n) => (n.title || "Untitled").toLowerCase().includes(q))
    .slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const insertLink = useCallback(
    (note: NoteRef) => {
      const { state } = editor;
      const { from } = state.selection;
      // Delete the "[[query" text (2 chars for [[ + query length)
      const start = from - query.length - 2;
      editor
        .chain()
        .focus()
        .deleteRange({ from: start, to: from })
        .insertContent({
          type: "noteLink",
          attrs: { noteId: note.id, noteTitle: note.title || "Untitled" },
        })
        .insertContent(" ")
        .run();
      onSelect();
    },
    [editor, query, onSelect]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1)
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) insertLink(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, insertLink, onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const item = menu.querySelector(
      `.note-link-item:nth-child(${selectedIndex + 1})`
    ) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div
        className="slash-menu note-link-menu"
        style={{ top: position.top, left: position.left }}
        ref={menuRef}
      >
        <div className="slash-menu-empty">
          {notes.length === 0 ? "No other notes" : "No matches"}
        </div>
      </div>
    );
  }

  return (
    <div
      className="slash-menu note-link-menu"
      style={{ top: position.top, left: position.left }}
      ref={menuRef}
    >
      <div className="slash-menu-header">Link to note</div>
      {filtered.map((n, i) => (
        <button
          key={n.id}
          className={`slash-menu-item note-link-item ${
            i === selectedIndex ? "selected" : ""
          }`}
          onClick={() => insertLink(n)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="slash-menu-icon">↗</span>
          <div className="slash-menu-text">
            <span className="slash-menu-label">{n.title || "Untitled"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
