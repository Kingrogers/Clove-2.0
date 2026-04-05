import { useState, useRef, useEffect } from "react";

export interface CustomField {
  key: string;
  value: string;
}

interface Props {
  createdAt?: number;
  updatedAt: number;
  description?: string;
  tags?: string[];
  customFields?: CustomField[];
  folderName?: string | null;
  generating: boolean;
  onAddField: (field: CustomField) => void;
  onRemoveField: (key: string) => void;
  onUpdateField: (key: string, value: string) => void;
  onRemoveTag: (tag: string) => void;
  onRegenerate: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5 H14" />
      <path d="M5.5 2 V5" />
      <path d="M10.5 2 V5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5 V8 L10 9.5" />
    </svg>
  );
}

function DescriptionIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4 H13" />
      <path d="M3 8 H13" />
      <path d="M3 12 H10" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 2.5 L13.5 7.5 L8.5 12.5 L3 12.5 L3 7 Z" />
      <circle cx="5.5" cy="9.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5 A1 1 0 0 1 3 3.5 H6 L7.5 5 H13 A1 1 0 0 1 14 6 V12 A1 1 0 0 1 13 13 H3 A1 1 0 0 1 2 12 Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5 V12.5" />
      <path d="M3.5 8 H12.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2 L9 6 L13 7 L9 8 L8 12 L7 8 L3 7 L7 6 Z" />
    </svg>
  );
}

export default function PropertiesPanel({
  createdAt,
  updatedAt,
  description,
  tags,
  customFields,
  folderName,
  generating,
  onAddField,
  onRemoveField,
  onUpdateField,
  onRemoveTag,
  onRegenerate,
}: Props) {
  const [addingField, setAddingField] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const newKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingField) newKeyRef.current?.focus();
  }, [addingField]);

  const commitNew = () => {
    const k = newKey.trim();
    if (!k) {
      setAddingField(false);
      setNewKey("");
      setNewValue("");
      return;
    }
    onAddField({ key: k, value: newValue.trim() });
    setNewKey("");
    setNewValue("");
    setAddingField(false);
  };

  const createdDate = createdAt ?? updatedAt;

  return (
    <aside className="properties-panel">
      <div className="properties-header">
        <span className="properties-title">Properties</span>
        <button
          className={`properties-regen-btn ${generating ? "spinning" : ""}`}
          onClick={onRegenerate}
          disabled={generating}
          title="Regenerate AI properties"
          aria-label="Regenerate properties"
        >
          <SparkleIcon />
        </button>
      </div>

      <div className="properties-rows">
        <div className="properties-row">
          <span className="properties-row-icon"><CalendarIcon /></span>
          <span className="properties-row-key">Created</span>
          <span className="properties-row-value">{formatDate(createdDate)}</span>
        </div>

        <div className="properties-row">
          <span className="properties-row-icon"><ClockIcon /></span>
          <span className="properties-row-key">Updated</span>
          <span className="properties-row-value">{formatDate(updatedAt)}</span>
        </div>

        {folderName && (
          <div className="properties-row">
            <span className="properties-row-icon"><FolderIcon /></span>
            <span className="properties-row-key">Folder</span>
            <span className="properties-row-value">{folderName}</span>
          </div>
        )}

        <div className="properties-row properties-row-stack">
          <div className="properties-row-top">
            <span className="properties-row-icon"><DescriptionIcon /></span>
            <span className="properties-row-key">Description</span>
            {generating && !description && (
              <span className="properties-row-generating">generating…</span>
            )}
          </div>
          <div className="properties-row-body">
            {description ? (
              <span className="properties-description">{description}</span>
            ) : (
              <span className="properties-empty">
                {generating ? "Analyzing note…" : "AI description will appear here."}
              </span>
            )}
          </div>
        </div>

        <div className="properties-row properties-row-stack">
          <div className="properties-row-top">
            <span className="properties-row-icon"><TagIcon /></span>
            <span className="properties-row-key">Tags</span>
            {generating && (!tags || tags.length === 0) && (
              <span className="properties-row-generating">generating…</span>
            )}
          </div>
          <div className="properties-row-body">
            {tags && tags.length > 0 ? (
              <div className="properties-tags">
                {tags.map((t) => (
                  <span key={t} className="properties-tag">
                    {t}
                    <button
                      className="properties-tag-remove"
                      onClick={() => onRemoveTag(t)}
                      title="Remove tag"
                      aria-label={`Remove tag ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="properties-empty">
                {generating ? "Analyzing note…" : "AI tags will appear here."}
              </span>
            )}
          </div>
        </div>

        {customFields?.map((f) => (
          <div key={f.key} className="properties-row properties-row-custom">
            <span className="properties-row-icon">·</span>
            <span className="properties-row-key">{f.key}</span>
            <input
              className="properties-custom-input"
              type="text"
              value={f.value}
              placeholder="Empty"
              onChange={(e) => onUpdateField(f.key, e.target.value)}
            />
            <button
              className="properties-custom-remove"
              onClick={() => onRemoveField(f.key)}
              title="Remove field"
              aria-label={`Remove field ${f.key}`}
            >
              ×
            </button>
          </div>
        ))}

        {addingField && (
          <div className="properties-row properties-row-new">
            <span className="properties-row-icon">·</span>
            <input
              ref={newKeyRef}
              type="text"
              className="properties-custom-input properties-custom-key"
              placeholder="Field name"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
                if (e.key === "Escape") {
                  setAddingField(false);
                  setNewKey("");
                  setNewValue("");
                }
              }}
            />
            <input
              type="text"
              className="properties-custom-input"
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
                if (e.key === "Escape") {
                  setAddingField(false);
                  setNewKey("");
                  setNewValue("");
                }
              }}
              onBlur={commitNew}
            />
          </div>
        )}
      </div>

      <button
        className="properties-add-btn"
        onClick={() => setAddingField(true)}
        disabled={addingField}
      >
        <PlusIcon />
        <span>Add a field</span>
      </button>
    </aside>
  );
}
