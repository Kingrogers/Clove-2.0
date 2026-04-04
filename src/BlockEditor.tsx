import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import SlashMenu from "./SlashMenu";
import NoteLinkMenu from "./NoteLinkMenu";
import { NoteLink, NOTE_LINK_REGEX } from "./NoteLinkExtension";

interface NoteRef {
  id: string;
  title: string;
  body?: string;
}

interface BlockEditorProps {
  noteId: string;
  content: string;
  contentVersion?: number;
  notes: NoteRef[];
  onChange: (markdown: string) => void;
  onNoteLinkClick: (id: string) => void;
}

export default function BlockEditor({
  noteId,
  content,
  contentVersion = 0,
  notes,
  onChange,
  onNoteLinkClick,
}: BlockEditorProps) {
  const [slash, setSlash] = useState<{
    open: boolean;
    query: string;
    position: { top: number; left: number };
  }>({ open: false, query: "", position: { top: 0, left: 0 } });

  const [linkMenu, setLinkMenu] = useState<{
    open: boolean;
    query: string;
    position: { top: number; left: number };
  }>({ open: false, query: "", position: { top: 0, left: 0 } });

  const [preview, setPreview] = useState<{
    open: boolean;
    title: string;
    snippet: string;
    top: number;
    left: number;
  }>({ open: false, title: "", snippet: "", top: 0, left: 0 });

  const slashRef = useRef(slash);
  slashRef.current = slash;
  const linkMenuRef = useRef(linkMenu);
  linkMenuRef.current = linkMenu;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const onNoteLinkClickRef = useRef(onNoteLinkClick);
  onNoteLinkClickRef.current = onNoteLinkClick;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        dropcursor: { color: "rgba(99, 102, 241, 0.4)", width: 2 },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      NoteLink,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return node.attrs.level === 1 ? "Heading 1" : "Heading 2";
          }
          return "Type '/' for blocks, '[[' to link, or just start writing...";
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

      // [[ link trigger
      const linkMatch = textBefore.match(/\[\[([^\]]*)$/);
      if (linkMatch) {
        const coords = editor.view.coordsAtPos(from);
        const editorEl = editor.view.dom.closest(".block-editor");
        const rect = editorEl?.getBoundingClientRect() ?? { top: 0, left: 0 };
        setLinkMenu({
          open: true,
          query: linkMatch[1],
          position: {
            top: coords.bottom - rect.top + 6,
            left: coords.left - rect.left,
          },
        });
        if (slashRef.current.open) {
          setSlash((s) => ({ ...s, open: false }));
        }
        return;
      } else if (linkMenuRef.current.open) {
        setLinkMenu((s) => ({ ...s, open: false }));
      }

      // / slash trigger
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
        const menuOpen = slashRef.current.open || linkMenuRef.current.open;
        if (menuOpen && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
          return true;
        }
        return false;
      },
    },
  });

  const closeSlash = useCallback(() => {
    setSlash((s) => ({ ...s, open: false }));
  }, []);
  const closeLinkMenu = useCallback(() => {
    setLinkMenu((s) => ({ ...s, open: false }));
  }, []);

  // Post-process loaded content: convert [[id|title]] text into NoteLink nodes
  const hydrateNoteLinks = useCallback((ed: NonNullable<typeof editor>) => {
    const replacements: Array<{
      from: number;
      to: number;
      id: string;
      title: string;
    }> = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text;
      const re = new RegExp(NOTE_LINK_REGEX.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        replacements.push({
          from: pos + m.index,
          to: pos + m.index + m[0].length,
          id: m[1],
          title: m[2],
        });
      }
    });
    if (replacements.length === 0) return;
    // Apply in reverse so positions stay valid
    replacements.reverse().forEach(({ from, to, id, title }) => {
      const nodeType = ed.schema.nodes.noteLink;
      if (!nodeType) return;
      ed.view.dispatch(
        ed.state.tr.replaceWith(
          from,
          to,
          nodeType.create({ noteId: id, noteTitle: title })
        )
      );
    });
  }, []);

  // Sync content when switching notes or content updated externally (e.g. AI)
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(content);
      hydrateNoteLinks(editor);
      setSlash((s) => ({ ...s, open: false }));
      setLinkMenu((s) => ({ ...s, open: false }));
    }
  }, [noteId, contentVersion, editor, hydrateNoteLinks]);

  // Close menus on blur/click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (slashRef.current.open && !target.closest(".slash-menu")) {
        setSlash((s) => ({ ...s, open: false }));
      }
      if (linkMenuRef.current.open && !target.closest(".note-link-menu")) {
        setLinkMenu((s) => ({ ...s, open: false }));
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Click + hover on .note-link elements inside the editor
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest(".note-link");
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const id = target.getAttribute("data-note-id");
      if (id) onNoteLinkClickRef.current(id);
    };

    const onMouseOver = (e: Event) => {
      const target = (e.target as HTMLElement).closest(
        ".note-link"
      ) as HTMLElement | null;
      if (!target) return;
      const id = target.getAttribute("data-note-id");
      if (!id) return;
      const note = notesRef.current.find((n) => n.id === id);
      const rect = target.getBoundingClientRect();
      const editorEl = dom.closest(".block-editor") as HTMLElement | null;
      const parentRect = editorEl?.getBoundingClientRect() ?? { top: 0, left: 0 };
      setPreview({
        open: true,
        title: note?.title || "Untitled",
        snippet: (note?.body || "").slice(0, 180) || "(empty note)",
        top: rect.bottom - parentRect.top + 6,
        left: rect.left - parentRect.left,
      });
    };

    const onMouseOut = (e: Event) => {
      const target = (e.target as HTMLElement).closest(".note-link");
      if (!target) return;
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (related && related.closest(".note-link-preview")) return;
      setPreview((p) => ({ ...p, open: false }));
    };

    dom.addEventListener("click", onClick);
    dom.addEventListener("mouseover", onMouseOver);
    dom.addEventListener("mouseout", onMouseOut);
    return () => {
      dom.removeEventListener("click", onClick);
      dom.removeEventListener("mouseover", onMouseOver);
      dom.removeEventListener("mouseout", onMouseOut);
    };
  }, [editor]);

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
      {linkMenu.open && editor && (
        <NoteLinkMenu
          editor={editor}
          notes={notes.filter((n) => n.id !== noteId)}
          query={linkMenu.query}
          position={linkMenu.position}
          onSelect={closeLinkMenu}
          onClose={closeLinkMenu}
        />
      )}
      {preview.open && (
        <div
          className="note-link-preview"
          style={{ top: preview.top, left: preview.left }}
        >
          <div className="note-link-preview-title">{preview.title}</div>
          <div className="note-link-preview-snippet">{preview.snippet}</div>
        </div>
      )}
    </div>
  );
}
