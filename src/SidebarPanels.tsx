import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Theme = "light" | "dark";

// ── Icons ──────────────────────────────────────────────

export function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Modal shell ────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthPx?: number;
}

function Modal({ title, onClose, children, widthPx = 480 }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="clv-modal-overlay" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="clv-modal"
        style={{ width: widthPx }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="clv-modal-header">
          <h2 className="clv-modal-title">{title}</h2>
          <button className="clv-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="clv-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ── Settings Panel ─────────────────────────────────────

interface SettingsProps {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  onClose: () => void;
}

export function SettingsModal({ theme, onThemeChange, onClose }: SettingsProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Modal title="Settings" onClose={onClose} widthPx={520}>
      <section className="clv-section">
        <h3 className="clv-section-title">Appearance</h3>
        <p className="clv-section-desc">Choose how Clove looks on this device.</p>
        <div className="clv-theme-toggle" role="radiogroup" aria-label="Theme">
          <button
            role="radio"
            aria-checked={theme === "light"}
            className={`clv-theme-option ${theme === "light" ? "active" : ""}`}
            onClick={() => onThemeChange("light")}
          >
            <div className="clv-theme-preview clv-theme-preview-light">
              <div className="clv-theme-preview-sidebar" />
              <div className="clv-theme-preview-main" />
            </div>
            <div className="clv-theme-option-label">
              <SunIcon />
              <span>Light</span>
            </div>
          </button>
          <button
            role="radio"
            aria-checked={theme === "dark"}
            className={`clv-theme-option ${theme === "dark" ? "active" : ""}`}
            onClick={() => onThemeChange("dark")}
          >
            <div className="clv-theme-preview clv-theme-preview-dark">
              <div className="clv-theme-preview-sidebar" />
              <div className="clv-theme-preview-main" />
            </div>
            <div className="clv-theme-option-label">
              <MoonIcon />
              <span>Dark</span>
            </div>
          </button>
        </div>
      </section>

      <div className="clv-section-separator" />

      <section className="clv-section">
        <h3 className="clv-section-title">Account</h3>
        <p className="clv-section-desc">Sign in to sync your notes across devices.</p>
        <form
          className="clv-login-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Placeholder — login not wired up yet
          }}
        >
          <label className="clv-field">
            <span className="clv-field-label">Email</span>
            <input
              type="email"
              className="clv-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="clv-field">
            <span className="clv-field-label">Password</span>
            <input
              type="password"
              className="clv-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="clv-form-actions">
            <button type="submit" className="clv-btn clv-btn-primary" disabled>
              Sign in
            </button>
            <button type="button" className="clv-btn clv-btn-ghost" disabled>
              Create account
            </button>
          </div>
          <p className="clv-form-hint">Account sync is coming soon.</p>
        </form>
      </section>
    </Modal>
  );
}

// ── Guide Panel ────────────────────────────────────────

interface GuideProps {
  onClose: () => void;
}

export function GuideModal({ onClose }: GuideProps) {
  return (
    <Modal title="Guide" onClose={onClose} widthPx={560}>
      <section className="clv-section">
        <h3 className="clv-section-title">Getting started</h3>
        <ul className="clv-guide-list">
          <li>
            <strong>Create a note</strong> — press <kbd>⌘</kbd> + <kbd>N</kbd> or click
            the <em>New note</em> button in the sidebar.
          </li>
          <li>
            <strong>Organize with folders</strong> — head to the Notes view and drop
            notes into folders. Each folder can have a color.
          </li>
          <li>
            <strong>Pin favorites</strong> — star any note to pin it to the top of the
            sidebar.
          </li>
        </ul>
      </section>

      <div className="clv-section-separator" />

      <section className="clv-section">
        <h3 className="clv-section-title">Linking &amp; the Graph</h3>
        <ul className="clv-guide-list">
          <li>
            <strong>Link notes</strong> — type <code>[[</code> inside any note to pick
            another note to link to.
          </li>
          <li>
            <strong>See connections</strong> — open the <em>Graph</em> tab to see every
            note and its links. Drag nodes around, zoom, and pan.
          </li>
          <li>
            <strong>Timeline</strong> — press play at the bottom of the Graph to watch
            your notes appear in order of creation.
          </li>
        </ul>
      </section>

      <div className="clv-section-separator" />

      <section className="clv-section">
        <h3 className="clv-section-title">AI assistant</h3>
        <ul className="clv-guide-list">
          <li>
            <strong>Ask the chat panel</strong> — open the chat panel and ask questions
            about your notes.
          </li>
          <li>
            <strong>Inline AI edits</strong> — select text and use the AI prompt bar to
            rewrite, summarize, or expand.
          </li>
        </ul>
      </section>

      <div className="clv-section-separator" />

      <section className="clv-section">
        <h3 className="clv-section-title">Keyboard shortcuts</h3>
        <div className="clv-shortcuts">
          <div className="clv-shortcut">
            <span>New note</span>
            <span className="clv-kbd-group">
              <kbd>⌘</kbd>
              <kbd>N</kbd>
            </span>
          </div>
          <div className="clv-shortcut">
            <span>Close dialog</span>
            <span className="clv-kbd-group">
              <kbd>Esc</kbd>
            </span>
          </div>
          <div className="clv-shortcut">
            <span>Link to note</span>
            <span className="clv-kbd-group">
              <kbd>[</kbd>
              <kbd>[</kbd>
            </span>
          </div>
        </div>
      </section>
    </Modal>
  );
}

// ── What's New Panel ───────────────────────────────────

interface WhatsNewProps {
  onClose: () => void;
}

interface Update {
  version: string;
  date: string;
  title: string;
  items: string[];
  tag?: "new" | "improved" | "fixed";
}

const UPDATES: Update[] = [
  {
    version: "0.6.0",
    date: "Apr 4, 2026",
    title: "Graph View, resizable sidebar & more",
    tag: "new",
    items: [
      "New Graph View — visualize all your notes, their links, and folders in one interactive canvas",
      "Timeline mode — play through your notes in chronological order",
      "Resizable sidebar — drag the right edge to resize between 180–480px",
      "Folder card menu no longer gets clipped near panel edges",
      "Theme settings — light and dark modes",
    ],
  },
  {
    version: "0.5.0",
    date: "Mar 28, 2026",
    title: "AI search and folders UI",
    tag: "new",
    items: [
      "Semantic search across all notes via embeddings",
      "Refreshed folder card design with colors",
      "Improved Notes view layout",
    ],
  },
  {
    version: "0.4.0",
    date: "Mar 20, 2026",
    title: "Tasks synced with notes",
    tag: "improved",
    items: [
      "Tasks view now shows two-way synced checkboxes from notes",
      "Toggle a task in either place and it updates instantly",
    ],
  },
  {
    version: "0.3.0",
    date: "Mar 12, 2026",
    title: "Note-to-note links",
    tag: "new",
    items: [
      "Wikilinks — type [[ to link between notes",
      "Backlinks show up in the properties panel",
    ],
  },
  {
    version: "0.2.0",
    date: "Mar 5, 2026",
    title: "Pop-up AI",
    tag: "new",
    items: [
      "Quick AI prompt bar for inline edits",
      "Chat panel for questions about your notes",
    ],
  },
];

export function WhatsNewModal({ onClose }: WhatsNewProps) {
  return (
    <Modal title="What's new" onClose={onClose} widthPx={560}>
      <div className="clv-updates">
        {UPDATES.map((u) => (
          <article key={u.version} className="clv-update">
            <header className="clv-update-header">
              <div className="clv-update-meta">
                <span className="clv-update-version">v{u.version}</span>
                <span className="clv-update-date">{u.date}</span>
                {u.tag && <span className={`clv-update-tag clv-update-tag-${u.tag}`}>{u.tag}</span>}
              </div>
              <h3 className="clv-update-title">{u.title}</h3>
            </header>
            <ul className="clv-update-list">
              {u.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Modal>
  );
}

// ── Bottom toolbar buttons ─────────────────────────────

interface ToolbarProps {
  onOpenSettings: () => void;
  onOpenGuide: () => void;
  onOpenWhatsNew: () => void;
}

export function SidebarToolbar({
  onOpenSettings,
  onOpenGuide,
  onOpenWhatsNew,
}: ToolbarProps) {
  return (
    <div className="sidebar-toolbar">
      <button
        className="sidebar-toolbar-btn"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
      >
        <SettingsIcon />
      </button>
      <button
        className="sidebar-toolbar-btn"
        onClick={onOpenGuide}
        title="Guide"
        aria-label="Guide"
      >
        <HelpIcon />
      </button>
      <button
        className="sidebar-toolbar-btn"
        onClick={onOpenWhatsNew}
        title="What's new"
        aria-label="What's new"
      >
        <SparkleIcon />
      </button>
    </div>
  );
}
