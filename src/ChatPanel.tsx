import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type ConnectionMode = "local" | "api";
type Phase = "checking" | "connected" | "not-found" | "api-setup";

interface ChatPanelProps {
  noteTitle: string;
  noteBody: string;
}

export default function ChatPanel({ noteTitle, noteBody }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<ConnectionMode>("local");
  const [phase, setPhase] = useState<Phase>("checking");
  const [claudeVersion, setClaudeVersion] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  // Auto-detect on mount — silent, no user action needed
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const version = await invoke<string>("check_claude_code");
        if (!cancelled) {
          setClaudeVersion(version);
          setMode("local");
          setPhase("connected");
          return;
        }
      } catch {
        /* not found */
      }

      try {
        const key = await invoke<string>("get_api_key");
        if (!cancelled && key) {
          setApiKey(key);
          setMode("api");
          setPhase("connected");
          return;
        }
      } catch {
        /* no key */
      }

      if (!cancelled) setPhase("not-found");
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-poll when not connected — connects the moment Claude is available
  useEffect(() => {
    if (phase !== "not-found") return;

    const interval = setInterval(async () => {
      try {
        const version = await invoke<string>("check_claude_code");
        setClaudeVersion(version);
        setMode("local");
        setPhase("connected");
      } catch {
        /* keep polling */
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [phase]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveKey = useCallback(() => {
    const key = keyInput.trim();
    if (!key) return;
    invoke("save_api_key", { key }).then(() => {
      setApiKey(key);
      setKeyInput("");
      setMode("api");
      setPhase("connected");
      setError(null);
    });
  }, [keyInput]);

  const disconnect = useCallback(() => {
    setPhase("not-found");
    setApiKey(null);
    setClaudeVersion("");
    setMessages([]);
  }, []);

  const openDownload = useCallback(() => {
    invoke("open_external", {
      url: "https://claude.ai/download",
    }).catch(() => {});
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || phase !== "connected") return;

    setInput("");
    setError(null);

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      let reply: string;

      if (mode === "local") {
        reply = await invoke<string>("chat_with_local_claude", {
          message: text,
          noteTitle,
          noteBody,
          history: messages,
        });
      } else {
        reply = await invoke<string>("chat_with_claude", {
          messages: newMessages,
          noteTitle,
          noteBody,
        });
      }

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, mode, phase, noteTitle, noteBody]);

  // ── Checking ──
  if (phase === "checking") {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <span className="chat-title">AI Assistant</span>
        </div>
        <div className="chat-empty">
          <div className="connect-spinner" />
          <p>Connecting to Claude...</p>
        </div>
      </div>
    );
  }

  // ── Not found / API setup ──
  if (phase === "not-found" || phase === "api-setup") {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <span className="chat-title">AI Assistant</span>
        </div>
        <div className="chat-setup-clean">
          {phase === "api-setup" ? (
            <>
              <p className="setup-heading">Enter API Key</p>
              <p className="setup-subtitle">
                Paste your Anthropic API key to connect.
              </p>
              <input
                type="password"
                className="chat-key-input"
                placeholder="sk-ant-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
                autoFocus
              />
              <button className="setup-primary-btn" onClick={saveKey}>
                Connect
              </button>
              <button
                className="setup-text-link"
                onClick={() => setPhase("not-found")}
              >
                Back
              </button>
            </>
          ) : (
            <>
              <div className="setup-claude-icon">
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <p className="setup-heading">Connect to Claude</p>
              <p className="setup-subtitle">
                Clove uses Claude Code to power AI features. Download it free to
                get started.
              </p>
              <button className="setup-primary-btn" onClick={openDownload}>
                Download Claude Code
              </button>
              <p className="setup-auto-detect">
                Clove will connect automatically once Claude is installed.
              </p>
              <button
                className="setup-text-link"
                onClick={() => setPhase("api-setup")}
              >
                Or use an API key instead
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Connected ──
  const versionShort = claudeVersion ? claudeVersion.split(" ")[0] : "";

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">AI Assistant</span>
          <div
            className="chat-connection-badge"
            onClick={disconnect}
            title="Click to disconnect"
          >
            <span className="status-dot green" />
            <span>Connected to Claude</span>
            {mode === "local" && versionShort && (
              <span className="badge-model">v{versionShort}</span>
            )}
            {mode === "api" && <span className="badge-model">API</span>}
          </div>
        </div>
        <span className="chat-context">Reading your note</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <p>Ask anything about your note</p>
            <div className="chat-suggestions">
              <button onClick={() => setInput("Summarize this note")}>
                Summarize this note
              </button>
              <button onClick={() => setInput("Suggest improvements")}>
                Suggest improvements
              </button>
              <button onClick={() => setInput("Continue writing")}>
                Continue writing
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            <div className="chat-msg-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-msg-content chat-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder="Ask about your note..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          rows={1}
        />
        <button
          className="chat-send"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          &uarr;
        </button>
      </div>
    </div>
  );
}
