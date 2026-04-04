import { Node, mergeAttributes } from "@tiptap/core";

export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-note-id"),
        renderHTML: (attrs) =>
          attrs.noteId ? { "data-note-id": attrs.noteId } : {},
      },
      noteTitle: {
        default: "",
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-note-title") ||
          (el as HTMLElement).textContent ||
          "",
        renderHTML: (attrs) => ({ "data-note-title": attrs.noteTitle || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-note-link": "",
        class: "note-link",
      }),
      node.attrs.noteTitle || "Untitled",
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: { noteId: string | null; noteTitle: string } }
        ) {
          const id = node.attrs.noteId ?? "";
          const title = node.attrs.noteTitle || "Untitled";
          state.write(`[[${id}|${title}]]`);
        },
        parse: {},
      },
    };
  },
});

export const NOTE_LINK_REGEX = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
