import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";

export interface SlashMenuItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: (editor: Editor) => void;
}

const ITEMS: SlashMenuItem[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain text block",
    icon: "Aa",
    action: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    description: "Large heading",
    icon: "H1",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small heading",
    icon: "H3",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Bullet List",
    description: "Simple bullet list",
    icon: "•",
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "Numbered List",
    description: "Ordered numbered list",
    icon: "1.",
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "To-do",
    description: "Checkbox item",
    icon: "☐",
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    description: "Block quote",
    icon: "❝",
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code Block",
    description: "Fenced code block",
    icon: "<>",
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal rule",
    icon: "—",
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

interface SlashMenuProps {
  editor: Editor;
  query: string;
  position: { top: number; left: number };
  onSelect: () => void;
  onClose: () => void;
}

export default function SlashMenu({ editor, query, position, onSelect, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeItem = useCallback(
    (item: SlashMenuItem) => {
      // Delete the slash and query text
      const { state } = editor;
      const { from } = state.selection;
      const slashStart = from - query.length - 1; // -1 for the '/'
      editor.chain().focus().deleteRange({ from: slashStart, to: from }).run();
      item.action(editor);
      onSelect();
    },
    [editor, query, onSelect]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeItem(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, executeItem, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const item = menu.children[selectedIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div className="slash-menu" style={{ top: position.top, left: position.left }} ref={menuRef}>
        <div className="slash-menu-empty">No results</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" style={{ top: position.top, left: position.left }} ref={menuRef}>
      {filtered.map((item, i) => (
        <button
          key={item.id}
          className={`slash-menu-item ${i === selectedIndex ? "selected" : ""}`}
          onClick={() => executeItem(item)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <div className="slash-menu-text">
            <span className="slash-menu-label">{item.label}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
