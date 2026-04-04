import { useEffect, useState, useCallback } from "react";
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Type '/' for commands, or just start writing...";
        },
      }),
      Markdown.configure({
        transformPastedText: true,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());

      // Track slash commands
      const { state } = editor;
      const { from } = state.selection;
      const textBefore = state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        "\n"
      );

      const slashMatch = textBefore.match(/\/([a-zA-Z0-9-]*)$/);
      if (slashMatch) {
        const coords = editor.view.coordsAtPos(from);
        const editorEl = editor.view.dom.closest(".block-editor");
        const rect = editorEl?.getBoundingClientRect() ?? { top: 0, left: 0 };

        setSlash({
          open: true,
          query: slashMatch[1],
          position: {
            top: coords.bottom - rect.top + 4,
            left: coords.left - rect.left,
          },
        });
      } else if (slash.open) {
        setSlash((s) => ({ ...s, open: false }));
      }
    },
    editorProps: {
      attributes: {
        class: "block-editor-content",
      },
      handleKeyDown: (_view, event) => {
        // Let the slash menu handle these keys
        if (slash.open && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
          return true;
        }
        return false;
      },
    },
  });

  // Close slash menu on click outside
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
