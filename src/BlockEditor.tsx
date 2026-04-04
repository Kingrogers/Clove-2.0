import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import SlashMenu from "./SlashMenu";

interface BlockEditorProps {
  noteId: string;
  content: string;
  onChange: (markdown: string) => void;
}

export default function BlockEditor({ noteId, content, onChange }: BlockEditorProps) {
  const [slash, setSlash] = useState<{
    open: boolean;
    query: string;
    position: { top: number; left: number };
  }>({ open: false, query: "", position: { top: 0, left: 0 } });

  const slashRef = useRef(slash);
  slashRef.current = slash;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        dropcursor: { color: "rgba(99, 102, 241, 0.4)", width: 2 },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return node.attrs.level === 1 ? "Heading 1" : "Heading 2";
          }
          return "Type '/' for blocks, or just start writing...";
        },
      }),
      Markdown.configure({
        transformPastedText: true,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());

      const { state } = editor;
      const { from } = state.selection;
      const start = Math.max(0, from - 50);
      const textBefore = state.doc.textBetween(start, from, "\n");

      const slashMatch = textBefore.match(/\/([a-zA-Z0-9-]*)$/);
      if (slashMatch) {
        const coords = editor.view.coordsAtPos(from);
        const editorEl = editor.view.dom.closest(".block-editor");
        const rect = editorEl?.getBoundingClientRect() ?? { top: 0, left: 0 };

        setSlash({
          open: true,
          query: slashMatch[1],
          position: {
            top: coords.bottom - rect.top + 6,
            left: coords.left - rect.left,
          },
        });
      } else if (slashRef.current.open) {
        setSlash((s) => ({ ...s, open: false }));
      }
    },
    editorProps: {
      attributes: {
        class: "block-editor-content",
      },
      handleKeyDown: (_view, event) => {
        if (slashRef.current.open && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
          return true;
        }
        return false;
      },
    },
  });

  const closeSlash = useCallback(() => {
    setSlash((s) => ({ ...s, open: false }));
  }, []);

  // Sync content when switching notes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const current = editor.storage.markdown.getMarkdown();
      if (current !== content) {
        editor.commands.setContent(content);
      }
      setSlash((s) => ({ ...s, open: false }));
    }
  }, [noteId, editor]);

  // Close slash menu on blur/click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (slashRef.current.open) {
        const target = e.target as HTMLElement;
        if (!target.closest(".slash-menu")) {
          setSlash((s) => ({ ...s, open: false }));
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="block-editor" style={{ position: "relative" }}>
      <EditorContent editor={editor} />
      {slash.open && editor && (
        <SlashMenu
          editor={editor}
          query={slash.query}
          position={slash.position}
          onSelect={closeSlash}
          onClose={closeSlash}
        />
      )}
    </div>
  );
}
