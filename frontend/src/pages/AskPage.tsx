import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { chatStream } from "../api/client";

function SourceTags({ sources }: { sources: Array<{ slug: string; title: string }> | string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div className="chat__msg-sources">
      <div className={`chat__source-list ${expanded ? "" : "chat__source-list--collapsed"}`}>
        {sources.map((s) => {
          const slug = typeof s === "string" ? s : s.slug;
          const title = typeof s === "string" ? s : s.title;
          return <Link key={slug} to={"/page/" + slug} className="chat__source-tag">{title}</Link>;
        })}
      </div>
      {sources.length > 3 && (
        <button className={`chat__source-expand ${expanded ? "chat__source-expand--active" : ""}`} onClick={() => setExpanded((v) => !v)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ slug: string; title: string }>;
  wikiSaved?: { title: string; slug: string } | null;
}

function saveConversationAsMarkdown(messages: Message[]) {
  const lines: string[] = [];
  lines.push("# 对话记录");
  lines.push("> 导出时间: " + new Date().toLocaleString("zh-CN"));
  lines.push("> 消息数: " + messages.length);
  lines.push("");
  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "用户" : "助手";
    lines.push("## " + roleLabel);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
    if (msg.sources && msg.sources.length > 0) {
      lines.push("*来源: " + msg.sources.map((s) => s.title).join(", ") + "*");
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }
  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "对话记录-" + new Date().toISOString().slice(0, 10) + ".md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SESSION_KEY = "chat_messages";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingMeta, setStreamingMeta] = useState<{
    sources: Array<{ slug: string; title: string }>;
    wikiSaved?: { title: string; slug: string } | null;
  } | null>(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userAtBottomRef = useRef(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {}
    initializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (messages.length > 0) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [messages]);

  useEffect(() => {
    const main = document.querySelector(".main");
    if (!main) return;
    const onScroll = () => {
      const threshold = 80;
      userAtBottomRef.current = main.scrollTop + main.clientHeight >= main.scrollHeight - threshold;
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (userAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingContent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    if (messages.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    const userMsg: Message = { role: "user", content: userText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    setStreamingContent("");
    setStreamingMeta(null);

    const history = updatedMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    abortRef.current = chatStream(history, {
      onToken: (token) => {
        setStreamingContent((prev) => prev + token);
      },
      onDone: (result) => {
        const msg: Message = {
          role: "assistant",
          content: result.content,
          sources: result.sources,
          wikiSaved: result.wikiSaved || undefined,
        };
        setMessages((prev) => [...prev, msg]);
        setStreamingContent("");
        setStreamingMeta(null);
        setLoading(false);
        abortRef.current = null;
      },
      onError: (err) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "请求失败: " + err.message },
        ]);
        setStreamingContent("");
        setStreamingMeta(null);
        setLoading(false);
        abortRef.current = null;
      },
    });
  };

  const handleClear = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setStreamingContent("");
    setStreamingMeta(null);
    sessionStorage.removeItem(SESSION_KEY);
    inputRef.current?.focus();
  };

  return (
    <div className="chat">
      <div className="chat__inner">
        <div className="chat__header">
          <div className="chat__header-left">
            <h1 className="chat__title">对话</h1>
            <span className="chat__subtitle">与 Wiki 知识库对话，探索和记录知识</span>
          </div>
          <div className="chat__header-actions">
            <button className="chat__btn" disabled={messages.length === 0} onClick={() => setShowExportConfirm(true)} title="导出对话记录">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              导出
            </button>
            <button className="chat__btn chat__btn--danger" disabled={messages.length === 0} onClick={() => setShowClearConfirm(true)} title="清空对话">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              清空
            </button>
          </div>
        </div>

        <div className="chat__msgs">
          {messages.length === 0 && (
            <div className="chat__empty">
              <div className="chat__empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <h2 className="chat__empty-title">Wiki 知识对话</h2>
              <p className="chat__empty-desc">
                与 LLM 讨论已有知识，或补充新内容。当提供的信息在 Wiki 中尚无记录时，可以自动整理保存。
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={"chat__msg chat__msg--" + msg.role}>
              {msg.role === "assistant" && (
                <div className="chat__msg-avatar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
                </div>
              )}
              <div className="chat__msg-body">
                <div className={"chat__msg-bubble" + (msg.role === "assistant" ? "" : " chat__msg-bubble--user")}>
                  {msg.role === "user" ? (
                    <p>{msg.content}</p>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {msg.wikiSaved && (
                  <div className="chat__msg-saved">
                    已保存到 Wiki：<Link to={"/page/" + msg.wikiSaved.slug}>{msg.wikiSaved.title}</Link>
                  </div>
                )}
                {msg.sources && msg.sources.length > 0 && <SourceTags sources={msg.sources} />}
              </div>
            </div>
          ))}

          {streamingContent && (
            <div className="chat__msg chat__msg--assistant">
              <div className="chat__msg-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
              </div>
              <div className="chat__msg-body">
                <div className="chat__msg-bubble">
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading && !streamingContent && (
            <div className="chat__msg chat__msg--assistant">
              <div className="chat__msg-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
              </div>
              <div className="chat__msg-body">
                <div className="chat__msg-bubble">
                  <span className="chat__typing">
                    <span className="chat__dot" /><span className="chat__dot" /><span className="chat__dot" />
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form className="chat__input-wrap" onSubmit={handleSubmit}>
          <div className="chat__input-bar">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="输入消息..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const form = (e.target as HTMLTextAreaElement).form;
                  if (form) form.requestSubmit();
                }
              }}
              disabled={loading}
              autoFocus
            />
            <button type="submit" className="chat__send" disabled={loading || !input.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </form>

        {showExportConfirm && (
          <div className="chat__confirm-overlay" onClick={() => setShowExportConfirm(false)}>
            <div className="chat__confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <p>确认导出全部对话记录为 Markdown 文件？</p>
              <div className="chat__confirm-actions">
                <button className="chat__btn" onClick={() => setShowExportConfirm(false)}>取消</button>
                <button className="chat__btn chat__btn--primary" onClick={() => {
                  saveConversationAsMarkdown(messages);
                  setShowExportConfirm(false);
                }}>确认导出</button>
              </div>
            </div>
          </div>
        )}

        {showClearConfirm && (
          <div className="chat__confirm-overlay" onClick={() => setShowClearConfirm(false)}>
            <div className="chat__confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <p>确认清空全部对话？此操作不可撤销。</p>
              <div className="chat__confirm-actions">
                <button className="chat__btn" onClick={() => setShowClearConfirm(false)}>取消</button>
                <button className="chat__btn chat__btn--danger" onClick={() => {
                  handleClear();
                  setShowClearConfirm(false);
                }}>确认清空</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
