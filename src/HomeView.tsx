import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  folderId?: string;
}

interface Folder {
  id: string;
  name: string;
}

interface SearchResult {
  id: string;
  score: number;
}

interface Props {
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function snippet(body: string, n = 140): string {
  const clean = body
    .replace(/^#+\s+/gm, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>]/g, "")
    .trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

export default function HomeView({ notes, folders, onOpenNote }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notesById = useMemo(() => {
    const m = new Map<string, Note>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const foldersById = useMemo(() => {
    const m = new Map<string, Folder>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (!q) {
      setHits(null);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await invoke<SearchResult[]>("semantic_search", {
          query: q,
          limit: 12,
        });
        // Filter out any hits whose notes no longer exist and below a floor score.
        const filtered = results.filter(
          (r) => notesById.has(r.id) && r.score > 0.1
        );
        setHits(filtered);
      } catch (e) {
        setError(String(e));
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, notesById]);

  const showingResults = hits !== null;

  return (
    <main className="home-view home-view-search">
      <div className="home-search-inner">
        <div className="home-search-header">
          <h1 className="home-search-greeting">Search your notes</h1>
          <p className="home-search-subtitle">
            Find notes by meaning, not just keywords. Runs locally on your Mac.
          </p>
        </div>

        <div className={`home-search-box ${searching ? "searching" : ""}`}>
          <span className="home-search-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14 L18 18" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="home-search-input"
            placeholder="Try “meeting with doctor” or “Q2 roadmap priorities”…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && hits && hits.length > 0) {
                onOpenNote(hits[0].id);
              }
            }}
            spellCheck={false}
          />
          {query && (
            <button
              className="home-search-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {error && <div className="home-search-error">{error}</div>}

        {showingResults && (
          <div className="home-search-results">
            {searching && hits?.length === 0 ? (
              <div className="home-search-empty">Searching…</div>
            ) : hits && hits.length === 0 ? (
              <div className="home-search-empty">
                No notes match “{query}”.
              </div>
            ) : (
              <>
                <div className="home-search-results-label">
                  {hits?.length} {hits?.length === 1 ? "result" : "results"}
                </div>
                <div className="home-search-list">
                  {hits?.map((hit) => {
                    const note = notesById.get(hit.id);
                    if (!note) return null;
                    const folder = note.folderId
                      ? foldersById.get(note.folderId)
                      : null;
                    const preview = snippet(note.body, 160);
                    return (
                      <button
                        key={note.id}
                        className="home-search-result"
                        onClick={() => onOpenNote(note.id)}
                      >
                        <div className="home-search-result-top">
                          <span className="home-search-result-title">
                            {note.title || "Untitled"}
                          </span>
                          <span className="home-search-result-score">
                            {Math.round(hit.score * 100)}%
                          </span>
                        </div>
                        {preview && (
                          <div className="home-search-result-preview">
                            {preview}
                          </div>
                        )}
                        <div className="home-search-result-footer">
                          {folder ? (
                            <span className="home-search-result-folder">
                              {folder.name}
                            </span>
                          ) : (
                            <span className="home-search-result-folder home-search-result-folder-empty">
                              Unfiled
                            </span>
                          )}
                          <span className="home-search-result-time">
                            {formatTime(note.updatedAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {!showingResults && (
          <div className="home-search-hint">
            <div className="home-search-hint-label">Try searching for</div>
            <div className="home-search-hint-chips">
              {[
                "project kickoff decisions",
                "grocery list",
                "Q2 roadmap",
                "meeting with doctor",
              ].map((s) => (
                <button
                  key={s}
                  className="home-search-hint-chip"
                  onClick={() => setQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
