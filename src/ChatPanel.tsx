import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  noteTitle: string;
  noteBody: string;
}

export default function ChatPanel({ noteTitle, noteBody }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [checkingKey, setCheckingKey] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check for existing API key on mount
  useEffect(() => {
    invoke<string>("get_api_key")
      .then((key) => {
        setApiKey(key);
        setCheckingKey(false);
      })
      .catch(() => {
        setCheckingKey(false);
      });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveKey = useCallback(() => {
    const key = keyInput.trim();
    if (!key) return;
    invoke("save_api_key", { key }).then(() => {
      setApiKey(key);
      setKeyInput("");
    });
  }, [keyInput]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const reply = await invoke<string>("chat_with_claude", {
        messages: newMessages,
        noteTitle,
        noteBody,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, noteTitle, noteBody]);

  // API key setup screen
  if (checkingKey) {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <span className="chat-title">AI Assistant</span>
        </div>
        <div className="chat-empty">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="chat-panel">
        <div className="chat-header">
          <span className="chat-title">AI Assistant</span>
        </div>
        <div className="chat-key-setup">
          <div className="chat-key-content">
            <h3>Connect to Claude</h3>
            <p>Enter your Anthropic API key to enable the AI assistant.</p>
            <input
              type="password"
              className="chat-key-input"
              placeholder="sk-ant-..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
            />
            <button className="chat-key-btn" onClick={saveKey}>
              Save Key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">AI Assistant</span>
        <span className="chat-context">Reading your note</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <p>Ask anything about your note</p>
            <div className="chat-suggestions">
              <button onClick={() => setInput("Summarize this note")}>Summarize this note</button>
              <button onClick={() => setInput("Suggest improvements")}>Suggest improvements</button>
              <button onClick={() => setInput("Continue writing")}>Continue writing</button>
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
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">{error}</div>
        )}

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
