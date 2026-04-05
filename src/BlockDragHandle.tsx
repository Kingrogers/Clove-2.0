import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

interface HoverState {
  top: number;
  nodePos: number;
}

interface DropTarget {
  top: number;
  nodePos: number;
  position: "before" | "after";
}

interface Props {
  editor: Editor | null;
}

/**
 * Notion-style drag handle with fully custom pointer-event drag/drop.
 *
 * We use pointer events instead of HTML5 drag & drop because:
 *  - pointerdown fires reliably on all elements (no `draggable` quirks)
 *  - we get full control over the visual feedback
 *  - we can create our own floating drag preview
 */
export default function BlockDragHandle({ editor }: Props) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [dragging, setDragging] = useState(false);

  const [btnEl, setBtnEl] = useState<HTMLButtonElement | null>(null);

  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const dropRef = useRef(drop);
  dropRef.current = drop;

  const draggingRef = useRef(false);
  const sourceNodePosRef = useRef<number | null>(null);
  const sourceElRef = useRef<HTMLElement | null>(null);
  const lastBlockElRef = useRef<HTMLElement | null>(null);
  const previewElRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // ── Hover tracking ──────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    const view = editor.view;
    const editorDom = view.dom as HTMLElement;
    const container = editorDom.closest(".block-editor") as HTMLElement | null;
    if (!container) return;

    const findTopLevelBlock = (
      clientX: number,
      clientY: number
    ): { pos: number; el: HTMLElement; blockRect: DOMRect } | null => {
      const editorRect = editorDom.getBoundingClientRect();
      const x = Math.max(
        editorRect.left + 12,
        Math.min(editorRect.right - 12, clientX)
      );
      const y = Math.max(
        editorRect.top + 2,
        Math.min(editorRect.bottom - 2, clientY)
      );
      const result = view.posAtCoords({ left: x, top: y });
      if (!result) return null;
      const $pos = view.state.doc.resolve(result.pos);
      if ($pos.depth === 0) return null;
      const topLevelPos = $pos.before(1);

      let blockEl: HTMLElement | null = null;
      try {
        const domRes = view.domAtPos(topLevelPos + 1);
        let el: HTMLElement | null =
          domRes.node.nodeType === Node.TEXT_NODE
            ? (domRes.node.parentElement as HTMLElement)
            : (domRes.node as HTMLElement);
        while (el && el.parentElement !== editorDom) {
          el = el.parentElement as HTMLElement | null;
        }
        if (el && el.parentElement === editorDom) blockEl = el;
      } catch {
        /* empty */
      }
      if (!blockEl) return null;
      return {
        pos: topLevelPos,
        el: blockEl,
        blockRect: blockEl.getBoundingClientRect(),
      };
    };

    const computeTopInContainer = (rect: DOMRect): number => {
      const containerRect = container.getBoundingClientRect();
      return rect.top - containerRect.top + container.scrollTop;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) return;
      const found = findTopLevelBlock(e.clientX, e.clientY);
      if (!found) {
        if (hoverRef.current) setHover(null);
        return;
      }
      lastBlockElRef.current = found.el;
      const top = computeTopInContainer(found.blockRect);
      const cur = hoverRef.current;
      if (!cur || cur.nodePos !== found.pos || Math.abs(cur.top - top) > 0.5) {
        setHover({ top, nodePos: found.pos });
      }
    };

    const onMouseLeave = () => {
      if (!draggingRef.current) setHover(null);
    };

    const onScroll = () => {
      if (!draggingRef.current) setHover(null);
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      container.removeEventListener("scroll", onScroll);
    };
  }, [editor]);

  // ── Pointer-event drag implementation ───────────────────
  useEffect(() => {
    const btn = btnEl;
    if (!btn || !editor) return;
    const view = editor.view;
    const editorDom = view.dom as HTMLElement;
    const container = editorDom.closest(".block-editor") as HTMLElement | null;
    if (!container) return;

    const findTopLevelBlock = (
      clientX: number,
      clientY: number
    ): { pos: number; el: HTMLElement; blockRect: DOMRect } | null => {
      const editorRect = editorDom.getBoundingClientRect();
      const x = Math.max(
        editorRect.left + 12,
        Math.min(editorRect.right - 12, clientX)
      );
      const y = Math.max(
        editorRect.top + 2,
        Math.min(editorRect.bottom - 2, clientY)
      );
      const result = view.posAtCoords({ left: x, top: y });
      if (!result) return null;
      const $pos = view.state.doc.resolve(result.pos);
      if ($pos.depth === 0) return null;
      const topLevelPos = $pos.before(1);

      let blockEl: HTMLElement | null = null;
      try {
        const domRes = view.domAtPos(topLevelPos + 1);
        let el: HTMLElement | null =
          domRes.node.nodeType === Node.TEXT_NODE
            ? (domRes.node.parentElement as HTMLElement)
            : (domRes.node as HTMLElement);
        while (el && el.parentElement !== editorDom) {
          el = el.parentElement as HTMLElement | null;
        }
        if (el && el.parentElement === editorDom) blockEl = el;
      } catch {
        /* empty */
      }
      if (!blockEl) return null;
      return {
        pos: topLevelPos,
        el: blockEl,
        blockRect: blockEl.getBoundingClientRect(),
      };
    };

    const computeTopInContainer = (rect: DOMRect): number => {
      const containerRect = container.getBoundingClientRect();
      return rect.top - containerRect.top + container.scrollTop;
    };

    const removePreview = () => {
      if (previewElRef.current) {
        previewElRef.current.remove();
        previewElRef.current = null;
      }
    };

    const cleanup = () => {
      sourceElRef.current?.classList.remove("pm-block-dragging");
      removePreview();
      setDrop(null);
      setDragging(false);
      draggingRef.current = false;
      sourceNodePosRef.current = null;
      sourceElRef.current = null;
      pointerIdRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only primary button
      if (e.button !== 0) return;
      const currentHover = hoverRef.current;
      const sourceEl = lastBlockElRef.current;
      if (!currentHover || !sourceEl) return;

      e.preventDefault();
      e.stopPropagation();

      draggingRef.current = true;
      setDragging(true);
      sourceNodePosRef.current = currentHover.nodePos;
      sourceElRef.current = sourceEl;
      pointerIdRef.current = e.pointerId;

      sourceEl.classList.add("pm-block-dragging");
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      // Create floating drag preview by cloning the block
      const preview = sourceEl.cloneNode(true) as HTMLElement;
      preview.classList.add("pm-block-drag-preview");
      preview.style.position = "fixed";
      preview.style.pointerEvents = "none";
      preview.style.zIndex = "9999";
      preview.style.width = `${sourceEl.offsetWidth}px`;
      preview.style.left = `${e.clientX + 8}px`;
      preview.style.top = `${e.clientY - 12}px`;
      preview.style.opacity = "0.85";
      preview.style.transform = "rotate(-1deg)";
      document.body.appendChild(preview);
      previewElRef.current = preview;

      // Capture pointer so we keep getting moves even if it leaves the button
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* empty */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();

      // Move preview
      if (previewElRef.current) {
        previewElRef.current.style.left = `${e.clientX + 8}px`;
        previewElRef.current.style.top = `${e.clientY - 12}px`;
      }

      // Auto-scroll container near edges
      const containerRect = container.getBoundingClientRect();
      const edge = 40;
      if (e.clientY < containerRect.top + edge) {
        container.scrollTop -= Math.max(4, (containerRect.top + edge - e.clientY) / 3);
      } else if (e.clientY > containerRect.bottom - edge) {
        container.scrollTop += Math.max(4, (e.clientY - (containerRect.bottom - edge)) / 3);
      }

      const found = findTopLevelBlock(e.clientX, e.clientY);
      if (!found) {
        if (dropRef.current) setDrop(null);
        return;
      }

      // Self-drop → no indicator
      if (sourceNodePosRef.current === found.pos) {
        if (dropRef.current) setDrop(null);
        return;
      }

      const midY = found.blockRect.top + found.blockRect.height / 2;
      const position: "before" | "after" =
        e.clientY < midY ? "before" : "after";

      const lineTop =
        position === "before"
          ? computeTopInContainer(found.blockRect) - 2
          : computeTopInContainer(found.blockRect) + found.blockRect.height - 1;

      const cur = dropRef.current;
      if (
        !cur ||
        cur.nodePos !== found.pos ||
        cur.position !== position ||
        Math.abs(cur.top - lineTop) > 0.5
      ) {
        setDrop({ top: lineTop, nodePos: found.pos, position });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();

      const currentDrop = dropRef.current;
      const sourcePos = sourceNodePosRef.current;

      try {
        if (pointerIdRef.current != null) {
          btn.releasePointerCapture(pointerIdRef.current);
        }
      } catch {
        /* empty */
      }

      // Perform the move if there's a valid drop target
      if (currentDrop && sourcePos != null) {
        const { doc } = view.state;
        const sourceNode = doc.nodeAt(sourcePos);
        if (sourceNode && sourcePos !== currentDrop.nodePos) {
          const sourceStart = sourcePos;
          const sourceEnd = sourcePos + sourceNode.nodeSize;

          const targetNode = doc.nodeAt(currentDrop.nodePos);
          if (targetNode) {
            const targetStart = currentDrop.nodePos;
            const targetEnd = currentDrop.nodePos + targetNode.nodeSize;
            const insertPos =
              currentDrop.position === "before" ? targetStart : targetEnd;

            if (insertPos !== sourceStart && insertPos !== sourceEnd) {
              const tr = view.state.tr;
              tr.delete(sourceStart, sourceEnd);
              const mappedInsertPos = tr.mapping.map(insertPos);
              tr.insert(mappedInsertPos, sourceNode);
              tr.scrollIntoView();
              view.dispatch(tr);

              // Brief flash on the landed block
              requestAnimationFrame(() => {
                try {
                  const res = view.domAtPos(mappedInsertPos + 1);
                  let landed: HTMLElement | null =
                    res.node.nodeType === Node.TEXT_NODE
                      ? (res.node.parentElement as HTMLElement)
                      : (res.node as HTMLElement);
                  while (landed && landed.parentElement !== editorDom) {
                    landed = landed.parentElement as HTMLElement | null;
                  }
                  if (landed) {
                    landed.classList.add("pm-block-landed");
                    setTimeout(
                      () => landed?.classList.remove("pm-block-landed"),
                      520
                    );
                  }
                } catch {
                  /* empty */
                }
              });

              setTimeout(() => view.focus(), 0);
            }
          }
        }
      }

      cleanup();
    };

    const onPointerCancel = () => {
      cleanup();
    };

    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("pointermove", onPointerMove);
    btn.addEventListener("pointerup", onPointerUp);
    btn.addEventListener("pointercancel", onPointerCancel);

    return () => {
      btn.removeEventListener("pointerdown", onPointerDown);
      btn.removeEventListener("pointermove", onPointerMove);
      btn.removeEventListener("pointerup", onPointerUp);
      btn.removeEventListener("pointercancel", onPointerCancel);
      cleanup();
    };
  }, [btnEl, editor]);

  return (
    <>
      {hover && (
        <button
          ref={setBtnEl}
          className={`block-drag-handle${dragging ? " dragging" : ""}`}
          style={{ top: hover.top }}
          contentEditable={false}
          aria-label="Drag to reorder block"
          title="Drag to reorder"
          type="button"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            <circle cx="2" cy="3" r="1.15" />
            <circle cx="2" cy="8" r="1.15" />
            <circle cx="2" cy="13" r="1.15" />
            <circle cx="8" cy="3" r="1.15" />
            <circle cx="8" cy="8" r="1.15" />
            <circle cx="8" cy="13" r="1.15" />
          </svg>
        </button>
      )}
      {drop && (
        <div
          className="block-drop-indicator"
          style={{ top: drop.top }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
