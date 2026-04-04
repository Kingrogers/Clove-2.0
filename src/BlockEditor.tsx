import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

interface BlockEditorProps {
  noteId: string;
  content: string;
  onChange: (markdown: string) => void;
}

export default function BlockEditor({ noteId, content, onChange }: BlockEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Type '/' for commands, or just start writing...";
        },
      }),
      Markdown,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: "block-editor-content",
      },
    },
  });

  // Sync content when switching notes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const current = editor.storage.markdown.getMarkdown();
      if (current !== content) {
        editor.commands.setContent(content);
      }
    }
  }, [noteId, editor]);

  return <EditorContent editor={editor} className="block-editor" />;
}
