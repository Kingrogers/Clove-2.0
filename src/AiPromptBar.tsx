import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}

export default function AiPromptBar({ onSubmit, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const p = prompt.trim();
    if (!p) return;
    onSubmit(p);
  }, [prompt, onSubmit]);

  return (
    <div className="ai-prompt-floating">
      <div className="ai-prompt-bar" onClick={(e) => e.stopPropagation()}>
        <div className="ai-prompt-row">
          <svg
            className="ai-prompt-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
          </svg>
          <input
            ref={inputRef}
            className="ai-prompt-input"
            type="text"
            placeholder="Draft a section, rewrite, reorganize..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
          />
          <span className="ai-prompt-shortcut">
            {prompt.trim() ? "↵" : "esc"}
          </span>
        </div>
      </div>
    </div>
  );
}
