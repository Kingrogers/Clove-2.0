import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import { FOLDER_COLORS, FolderColor } from "./FolderCardMenu";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  createdAt?: number;
  folderId?: string;
  tags?: string[];
}

interface Folder {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
}

type ViewMode = "links" | "folders";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  folderId?: string;
  createdAt: number;
  tags: string[];
  degree: number;
  color: string;
  radius: number;
  // Smooth appearance animation
  appearT: number; // 0..1
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

const WIKILINK_REGEX = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

// Resolve a folder's color id to a hex the canvas can paint
function folderHex(folder: Folder | undefined): string {
  if (!folder?.color) return "#94a3b8"; // text-tertiary for un-foldered
  const preset = FOLDER_COLORS.find((c) => c.id === (folder.color as FolderColor));
  return preset?.dot ?? "#94a3b8";
}

// Stable hash to string → hex (used for tag coloring)
function tagHex(tag: string): string {
  // Palette borrowed from folder colors for consistency
  const palette = [
    "#4374e4", "#9333ea", "#ec4899", "#ef4444",
    "#f97316", "#eab308", "#16a34a", "#06b6d4",
  ];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

// Parse [[id|title]] wikilinks from a note body, return linked note ids
function extractLinks(body: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(WIKILINK_REGEX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) ids.push(m[1]);
  return ids;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Cubic-out easing for node "pop in"
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export default function GraphView({ notes, folders, onOpenNote }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const rafRef = useRef<number | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const hoverRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dprRef = useRef<number>(1);
  // Neighbor adjacency: for each node id, set of directly-linked ids
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  // Drag state
  const dragRef = useRef<{
    node: GraphNode | null;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ node: null, startX: 0, startY: 0, moved: false });

  const [mode, setMode] = useState<ViewMode>("links");
  const [nameQuery, setNameQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>(""); // folder id or "" for all
  const [tagFilter, setTagFilter] = useState<string>(""); // tag or "" for all
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");

  const [timelineMode, setTimelineMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scrubT, setScrubT] = useState(1); // 0..1
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);

  const folderById = useMemo(() => {
    const m = new Map<string, Folder>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  // All distinct tags across notes
  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => (n.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  // Apply filters → list of note ids to include
  const filteredNoteIds = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    const q = nameQuery.trim().toLowerCase();
    const set = new Set<string>();
    for (const n of notes) {
      if (folderFilter && n.folderId !== folderFilter) continue;
      if (tagFilter && !(n.tags ?? []).includes(tagFilter)) continue;
      const ts = n.createdAt ?? n.updatedAt;
      if (ts < fromTs || ts > toTs) continue;
      if (q && !(n.title || "Untitled").toLowerCase().includes(q)) continue;
      set.add(n.id);
    }
    return set;
  }, [notes, folderFilter, tagFilter, dateFrom, dateTo, nameQuery]);

  // Build graph data from filters + view mode
  const graphData = useMemo(() => {
    const nodesById = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // Construct nodes (degree fills in later)
    for (const n of notes) {
      if (!filteredNoteIds.has(n.id)) continue;
      const folder = n.folderId ? folderById.get(n.folderId) : undefined;
      let color = folderHex(folder);
      if (mode === "folders" && !folder && (n.tags ?? []).length > 0) {
        color = tagHex((n.tags ?? [])[0]);
      }
      nodesById.set(n.id, {
        id: n.id,
        title: n.title || "Untitled",
        folderId: n.folderId,
        createdAt: n.createdAt ?? n.updatedAt,
        tags: n.tags ?? [],
        degree: 0,
        color,
        radius: 5,
        appearT: 1, // full opacity by default; timeline mode animates this
      });
    }

    if (mode === "links") {
      // Edges from [[id|title]] wikilinks
      for (const n of notes) {
        if (!nodesById.has(n.id)) continue;
        const linked = extractLinks(n.body);
        for (const tid of linked) {
          if (tid === n.id) continue;
          if (!nodesById.has(tid)) continue;
          links.push({ source: n.id, target: tid });
          const a = nodesById.get(n.id)!;
          const b = nodesById.get(tid)!;
          a.degree++;
          b.degree++;
        }
      }
    }
    // Folder/Tag mode: no link edges — clustering by position only

    // Size nodes by degree (links mode) or by tag/folder density (folders mode)
    for (const node of nodesById.values()) {
      const base = 4.5;
      const extra = mode === "links" ? Math.min(node.degree * 0.9, 10) : 1.2;
      node.radius = base + extra;
    }

    return {
      nodes: Array.from(nodesById.values()),
      links,
    };
  }, [notes, folderById, filteredNoteIds, mode]);

  // Timeline bounds
  const timelineBounds = useMemo(() => {
    if (graphData.nodes.length === 0) return { min: 0, max: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const n of graphData.nodes) {
      if (n.createdAt < min) min = n.createdAt;
      if (n.createdAt > max) max = n.createdAt;
    }
    if (min === Infinity) return { min: 0, max: 0 };
    return { min, max };
  }, [graphData]);

  const currentScrubTs = useMemo(() => {
    const { min, max } = timelineBounds;
    if (max <= min) return max;
    return min + (max - min) * scrubT;
  }, [timelineBounds, scrubT]);

  // Set node count for hint
  useEffect(() => {
    setNodeCount(graphData.nodes.length);
  }, [graphData]);

  // Build adjacency map for fast neighbor lookups (hover highlighting)
  useEffect(() => {
    const adj = new Map<string, Set<string>>();
    for (const n of graphData.nodes) adj.set(n.id, new Set());
    for (const l of graphData.links) {
      const sId = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
      const tId = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
      adj.get(sId)?.add(tId);
      adj.get(tId)?.add(sId);
    }
    adjacencyRef.current = adj;
  }, [graphData]);

  // Setup / teardown force simulation when graphData or mode changes
  useEffect(() => {
    if (simRef.current) {
      simRef.current.stop();
    }
    const { nodes, links } = graphData;
    if (nodes.length === 0) {
      simRef.current = null;
      return;
    }

    // Seed positions near center to avoid big initial sprawl
    const { w, h } = sizeRef.current;
    const cx = (w || 800) / 2;
    const cy = (h || 600) / 2;
    for (const n of nodes) {
      if (n.x == null) n.x = cx + (Math.random() - 0.5) * 60;
      if (n.y == null) n.y = cy + (Math.random() - 0.5) * 60;
    }

    const sim = d3
      .forceSimulation<GraphNode, GraphLink>(nodes)
      .alphaDecay(0.028)
      .velocityDecay(0.4)
      .force("center", d3.forceCenter(cx, cy).strength(0.05))
      .force(
        "charge",
        d3
          .forceManyBody<GraphNode>()
          .strength(mode === "links" ? -160 : -90)
          .distanceMax(420)
      )
      .force(
        "collide",
        d3
          .forceCollide<GraphNode>()
          .radius((d) => d.radius + 6)
          .strength(0.9)
      );

    if (mode === "links" && links.length > 0) {
      sim.force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(80)
          .strength(0.55)
      );
    }

    if (mode === "folders") {
      // Cluster nodes by folderId → each folder gets an anchor point on a grid
      const folderIds = Array.from(
        new Set(nodes.map((n) => n.folderId ?? "__none__"))
      );
      const cols = Math.max(1, Math.ceil(Math.sqrt(folderIds.length)));
      const spacing = 220;
      const anchors = new Map<string, { x: number; y: number }>();
      folderIds.forEach((fid, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        anchors.set(fid, {
          x: cx + (col - (cols - 1) / 2) * spacing,
          y: cy + (row - (folderIds.length / cols - 1) / 2) * spacing,
        });
      });
      sim
        .force(
          "x",
          d3
            .forceX<GraphNode>()
            .x((d) => anchors.get(d.folderId ?? "__none__")?.x ?? cx)
            .strength(0.18)
        )
        .force(
          "y",
          d3
            .forceY<GraphNode>()
            .y((d) => anchors.get(d.folderId ?? "__none__")?.y ?? cy)
            .strength(0.18)
        );
    }

    // Stop repainting React on every tick — we drive our own render loop
    sim.on("tick", () => {});
    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [graphData, mode]);

  // Canvas resize + zoom setup (once)
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // d3-zoom (pan + zoom) — attach to canvas, but apply transform manually
    const zoomBehavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 6])
      .filter((ev) => {
        // Wheel always zooms
        if (ev.type === "wheel") return true;
        // Skip if user is starting a drag on a node
        if (ev.type === "mousedown" || ev.type === "pointerdown") {
          if (ev.button !== 0) return false;
          return dragRef.current.node == null;
        }
        return ev.button === 0;
      })
      .on("zoom", (ev) => {
        transformRef.current = ev.transform;
      });

    d3.select(canvas).call(zoomBehavior);

    // Helper: find topmost node under a world-space point
    const hitNodeAtWorld = (wx: number, wy: number): GraphNode | null => {
      const sim = simRef.current;
      if (!sim) return null;
      const nodes = sim.nodes();
      let best: GraphNode | null = null;
      let bestDist = Infinity;
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        if (n.appearT < 0.6) continue;
        const dx = (n.x as number) - wx;
        const dy = (n.y as number) - wy;
        const d2 = dx * dx + dy * dy;
        const r = n.radius + 4;
        if (d2 <= r * r && d2 < bestDist) {
          bestDist = d2;
          best = n;
        }
      }
      return best;
    };

    // Pointer tracking for hover + drag
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      pointerRef.current = { x: px, y: py };

      const drag = dragRef.current;
      if (drag.node) {
        const dx = px - drag.startX;
        const dy = py - drag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
        // Convert screen → world coords
        const t = transformRef.current;
        const wx = (px - t.x) / t.k;
        const wy = (py - t.y) / t.k;
        drag.node.fx = wx;
        drag.node.fy = wy;
      }
    };

    const onLeave = () => {
      pointerRef.current = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const t = transformRef.current;
      const wx = (px - t.x) / t.k;
      const wy = (py - t.y) / t.k;
      const node = hitNodeAtWorld(wx, wy);
      if (!node) return;
      // Start dragging this node
      dragRef.current.node = node;
      dragRef.current.startX = px;
      dragRef.current.startY = py;
      dragRef.current.moved = false;
      node.fx = node.x;
      node.fy = node.y;
      const sim = simRef.current;
      if (sim) sim.alphaTarget(0.3).restart();
      canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.node) return;
      const node = drag.node;
      const moved = drag.moved;
      // Release the pinned position so physics takes over again
      node.fx = null;
      node.fy = null;
      const sim = simRef.current;
      if (sim) sim.alphaTarget(0);
      dragRef.current.node = null;
      dragRef.current.moved = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      // If pointer barely moved, treat as click → open note
      if (!moved) onOpenNote(node.id);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      d3.select(canvas).on(".zoom", null);
    };
  }, [onOpenNote]);

  // Render loop — driven by rAF, independent of React renders
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let prevTs = performance.now();

    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - prevTs) / 1000); // cap dt to prevent jumps
      prevTs = ts;

      const dpr = dprRef.current;
      const { w, h } = sizeRef.current;
      const tr = transformRef.current;
      const sim = simRef.current;

      // Clear
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Theme-aware background + grid
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";

      // Subtle background wash
      ctx.fillStyle = isDark ? "#10141c" : "#fafbff";
      ctx.fillRect(0, 0, w, h);

      // Gentle grid (only when not zoomed way out)
      if (tr.k > 0.5) {
        ctx.strokeStyle = isDark
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(15, 23, 42, 0.035)";
        ctx.lineWidth = 1;
        const step = 40 * tr.k;
        const offX = tr.x % step;
        const offY = tr.y % step;
        ctx.beginPath();
        for (let x = offX; x < w; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = offY; y < h; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      }

      // Apply zoom transform
      ctx.translate(tr.x, tr.y);
      ctx.scale(tr.k, tr.k);

      if (sim) {
        const nodes = sim.nodes();

        // Advance appearT animation (spring pop-in)
        for (const n of nodes) {
          // Timeline mode: visibility gated by createdAt <= currentScrubTs
          const visible =
            !timelineMode || n.createdAt <= currentScrubTs;
          const target = visible ? 1 : 0;
          const speed = visible ? 3.5 : 6;
          n.appearT += (target - n.appearT) * Math.min(1, dt * speed);
          if (Math.abs(n.appearT - target) < 0.002) n.appearT = target;
        }

        // Viewport bounds in world coords — for culling
        const viewLeft = -tr.x / tr.k - 20;
        const viewTop = -tr.y / tr.k - 20;
        const viewRight = (w - tr.x) / tr.k + 20;
        const viewBottom = (h - tr.y) / tr.k + 20;

        // Pointer → world coords, for hit testing
        const ptr = pointerRef.current;
        let pworldX = 0;
        let pworldY = 0;
        let ptrActive = false;
        if (ptr) {
          pworldX = (ptr.x - tr.x) / tr.k;
          pworldY = (ptr.y - tr.y) / tr.k;
          ptrActive = true;
        }

        // Determine hover target first (so we can highlight its neighborhood)
        let hovered: GraphNode | null = null;
        if (ptrActive && !dragRef.current.node) {
          let hoverDist = Infinity;
          for (const n of nodes) {
            if (n.appearT < 0.6) continue;
            if (n.x == null || n.y == null) continue;
            const nx = n.x as number;
            const ny = n.y as number;
            const dx = nx - pworldX;
            const dy = ny - pworldY;
            const d2 = dx * dx + dy * dy;
            const r = n.radius + 4;
            if (d2 <= r * r && d2 < hoverDist) {
              hoverDist = d2;
              hovered = n;
            }
          }
        }
        // If we're dragging, the dragged node is the focus
        const focus = dragRef.current.node ?? hovered;
        const adj = adjacencyRef.current;
        const neighbors = focus ? adj.get(focus.id) : null;
        const hasFocus = !!focus;

        // Draw edges (Obsidian-like: thin gray lines, highlight connected on hover)
        if (mode === "links") {
          const links = sim.force("link") as
            | d3.ForceLink<GraphNode, GraphLink>
            | undefined;
          if (links) {
            const lks = links.links() as GraphLink[];
            // Two passes: dim edges first, then highlighted on top
            for (const l of lks) {
              const s = l.source as GraphNode;
              const t = l.target as GraphNode;
              if (s.x == null || t.x == null) continue;
              const minX = Math.min(s.x as number, t.x as number);
              const maxX = Math.max(s.x as number, t.x as number);
              const minY = Math.min(s.y as number, t.y as number);
              const maxY = Math.max(s.y as number, t.y as number);
              if (maxX < viewLeft || minX > viewRight) continue;
              if (maxY < viewTop || minY > viewBottom) continue;
              const alpha = Math.min(s.appearT, t.appearT);
              if (alpha < 0.05) continue;

              const connected =
                hasFocus && (s.id === focus!.id || t.id === focus!.id);
              const baseAlpha = hasFocus ? (connected ? 0.85 : 0.08) : 0.42;
              ctx.strokeStyle = connected
                ? (isDark ? "#818cf8" : "#4f46e5")
                : (isDark ? "#4b5268" : "#94a3b8");
              ctx.lineWidth = (connected ? 1.6 : 1.1) / tr.k;
              ctx.globalAlpha = alpha * baseAlpha;
              ctx.beginPath();
              ctx.moveTo(s.x as number, s.y as number);
              ctx.lineTo(t.x as number, t.y as number);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        }

        // Draw nodes (flat Obsidian-style dots, with viewport culling)
        for (const n of nodes) {
          if (n.appearT <= 0.02) continue;
          if (n.x == null || n.y == null) continue;
          const nx = n.x as number;
          const ny = n.y as number;
          if (nx < viewLeft || nx > viewRight) continue;
          if (ny < viewTop || ny > viewBottom) continue;

          // Spring pop-in scale
          const e = easeOutBack(Math.min(1, Math.max(0, n.appearT)));
          const scale = 0.5 + 0.5 * e;
          const r = n.radius * scale;

          // Dim nodes not connected to focus
          const isFocus = hasFocus && n.id === focus!.id;
          const isNeighbor = hasFocus && neighbors && neighbors.has(n.id);
          const dim = hasFocus && !isFocus && !isNeighbor ? 0.22 : 1;

          // Solid flat dot
          ctx.globalAlpha = n.appearT * dim;
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = 1;
        }

        // Always-visible labels under each node (fade out when zoomed way out)
        const labelAlpha = Math.min(1, Math.max(0, (tr.k - 0.45) / 0.55));
        if (labelAlpha > 0.01) {
          // Keep labels at ~11px on screen regardless of zoom by drawing in world units
          const fontSize = 11 / tr.k;
          ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          for (const n of nodes) {
            if (n.appearT < 0.6) continue;
            if (n.x == null || n.y == null) continue;
            const nx = n.x as number;
            const ny = n.y as number;
            if (nx < viewLeft || nx > viewRight) continue;
            if (ny < viewTop || ny > viewBottom) continue;
            const isFocus = hasFocus && n.id === focus!.id;
            const isNeighbor = hasFocus && neighbors && neighbors.has(n.id);
            const dim = hasFocus && !isFocus && !isNeighbor ? 0.18 : 1;
            ctx.fillStyle = isDark
              ? hasFocus && (isFocus || isNeighbor)
                ? "rgba(232, 236, 244, 0.95)"
                : "rgba(232, 236, 244, 0.68)"
              : hasFocus && (isFocus || isNeighbor)
                ? "rgba(15, 23, 42, 0.9)"
                : "rgba(15, 23, 42, 0.62)";
            ctx.globalAlpha = labelAlpha * n.appearT * dim;
            const title =
              n.title.length > 32 ? n.title.slice(0, 30) + "…" : n.title;
            ctx.fillText(title, nx, ny + n.radius + 5 / tr.k);
          }
          ctx.globalAlpha = 1;
        }

        // Highlight focus node with a bright ring (Obsidian does this on hover)
        if (focus) {
          const nx = focus.x as number;
          const ny = focus.y as number;
          ctx.strokeStyle = isDark ? "#818cf8" : "#4f46e5";
          ctx.lineWidth = 2 / tr.k;
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(nx, ny, focus.radius + 3.5 / tr.k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Update hover state for tooltip (React-side)
        const nextHoverId = hovered?.id ?? null;
        if (nextHoverId !== hoverRef.current) {
          hoverRef.current = nextHoverId;
          setHoverTitle(hovered?.title ?? null);
          canvas.style.cursor = dragRef.current.node
            ? "grabbing"
            : hovered
              ? "pointer"
              : "grab";
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, timelineMode, currentScrubTs]);

  // Timeline play/pause animation
  useEffect(() => {
    if (!playing) return;
    let raf: number | null = null;
    let last = performance.now();
    const dur = 8000; // total play duration in ms
    const step = (ts: number) => {
      const dt = ts - last;
      last = ts;
      setScrubT((t) => {
        const next = t + dt / dur;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [playing]);

  // When enabling timeline, start from the beginning and reset appearT for all nodes
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const nodes = sim.nodes();
    if (timelineMode) {
      setScrubT(0);
      // Only nodes whose createdAt <= scrub will appear; start hidden for the rest
      for (const n of nodes) n.appearT = 0;
    } else {
      // Show everyone
      for (const n of nodes) n.appearT = 1;
      setPlaying(false);
    }
  }, [timelineMode]);

  // Kick simulation back to life whenever filters or mode change so layout settles
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.alpha(0.9).restart();
  }, [graphData, mode]);

  const togglePlay = useCallback(() => {
    if (!timelineMode) setTimelineMode(true);
    if (scrubT >= 0.999) setScrubT(0);
    setPlaying((p) => !p);
  }, [timelineMode, scrubT]);

  const resetFilters = useCallback(() => {
    setNameQuery("");
    setFolderFilter("");
    setTagFilter("");
    setDateFrom("");
    setDateTo("");
  }, []);

  return (
    <main className="graph-view">
      <header className="graph-toolbar">
        <div className="graph-mode-toggle" role="tablist">
          <button
            className={`graph-mode-tab ${mode === "links" ? "active" : ""}`}
            onClick={() => setMode("links")}
            role="tab"
            aria-selected={mode === "links"}
          >
            Links
          </button>
          <button
            className={`graph-mode-tab ${mode === "folders" ? "active" : ""}`}
            onClick={() => setMode("folders")}
            role="tab"
            aria-selected={mode === "folders"}
          >
            Folders & Tags
          </button>
        </div>
        <div className="graph-count">{nodeCount} {nodeCount === 1 ? "note" : "notes"}</div>
      </header>

      <div className="graph-filter-bar">
        <div className="graph-filter-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="text"
            placeholder="Search notes…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
          />
        </div>
        <select
          className="graph-filter-select"
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          title="Filter by folder"
        >
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          className="graph-filter-select"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          title="Filter by tag"
          disabled={allTags.length === 0}
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="graph-filter-dates">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From date"
          />
          <span className="graph-filter-sep">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To date"
          />
        </div>
        {(nameQuery || folderFilter || tagFilter || dateFrom || dateTo) && (
          <button className="graph-filter-clear" onClick={resetFilters}>
            Clear
          </button>
        )}
      </div>

      <div ref={wrapRef} className="graph-canvas-wrap">
        <canvas ref={canvasRef} className="graph-canvas" />

        {nodeCount === 0 && (
          <div className="graph-empty">
            <div className="graph-empty-title">No notes match your filters</div>
            <div className="graph-empty-hint">Adjust the filters above to see your graph.</div>
          </div>
        )}

        {hoverTitle && pointerRef.current && (
          <div
            className="graph-tooltip"
            style={{
              left: pointerRef.current.x + 14,
              top: pointerRef.current.y + 14,
            }}
          >
            {hoverTitle}
          </div>
        )}
      </div>

      <footer className="graph-timeline">
        <button
          className={`graph-timeline-play ${playing ? "playing" : ""}`}
          onClick={togglePlay}
          disabled={nodeCount === 0}
          title={playing ? "Pause" : "Play timeline"}
          aria-label={playing ? "Pause" : "Play timeline"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="graph-timeline-label">
          {timelineBounds.max > 0
            ? timelineMode
              ? formatDate(currentScrubTs)
              : `${formatDate(timelineBounds.min)} → ${formatDate(timelineBounds.max)}`
            : "—"}
        </div>
        <input
          className="graph-timeline-scrub"
          type="range"
          min={0}
          max={1000}
          value={Math.round(scrubT * 1000)}
          onChange={(e) => {
            if (!timelineMode) setTimelineMode(true);
            setPlaying(false);
            setScrubT(Number(e.target.value) / 1000);
          }}
          disabled={nodeCount === 0}
        />
        <button
          className={`graph-timeline-toggle ${timelineMode ? "active" : ""}`}
          onClick={() => setTimelineMode((t) => !t)}
          title="Toggle timeline mode"
        >
          Timeline
        </button>
      </footer>
    </main>
  );
}
