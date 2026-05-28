import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { queryWiki, putPage } from "../api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wiki-page";
}

function deriveTitle(q: string): string {
  const cleaned = q.replace(/^(什么是|介绍|解释|请|能否|帮我)\s*/i, "");
  return cleaned.length > 30 ? cleaned.slice(0, 30) + "..." : cleaned;
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好！我可以基于 Wiki 知识回答你的问题。可以问我关于已经消化过的任何话题。",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState<{
    msgIdx: number;
    title: string;
    content: string;
    saving: boolean;
    saved: boolean;
    error: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await queryWiki(userMsg.content);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, sources: res.sources },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ 查询失败: " + e.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleWriteClick = (msgIdx: number, msg: Message) => {
    if (writing) return;
    const prevMsg = messages[msgIdx - 1];
    const suggested = prevMsg?.role === "user" ? deriveTitle(prevMsg.content) : "知识笔记";
    setWriting({
      msgIdx,
      title: suggested,
      content: msg.content,
      saving: false,
      saved: false,
      error: "",
    });
  };

  const handleWriteSave = async () => {
    if (!writing) return;
    setWriting((w) => w ? { ...w, saving: true, error: "" } : null);
    try {
      const slug = slugify(writing.title);
      await putPage(slug, writing.content);
      setWriting((w) => w ? { ...w, saving: false, saved: true, error: "" } : null);
    } catch (e: any) {
      setWriting((w) => w ? { ...w, saving: false, error: e.message } : null);
    }
  };

  const handleWriteCancel = () => setWriting(null);

  const renderWriteForm = () => {
    if (!writing) return null;
    return (
      <div className="write-form">
        <input
          className="write-form__input"
          value={writing.title}
          onChange={(e) =>
            setWriting((w) => w ? { ...w, title: e.target.value } : null)
          }
          placeholder="页面标题"
          disabled={writing.saving}
        />
        <textarea
          className="write-form__textarea"
          value={writing.content}
          onChange={(e) =>
            setWriting((w) => w ? { ...w, content: e.target.value } : null)
          }
          placeholder="Wiki 内容 (Markdown)"
          rows={6}
          disabled={writing.saving}
        />
        {writing.error && (
          <div className="write-form__error">{writing.error}</div>
        )}
        <div className="write-form__btns">
          <button
            className="write-btn write-btn--save"
            onClick={handleWriteSave}
            disabled={writing.saving || !writing.title.trim()}
          >
            {writing.saving ? "保存中..." : "保存"}
          </button>
          <button
            className="write-btn write-btn--cancel"
            onClick={handleWriteCancel}
            disabled={writing.saving}
          >
            取消
          </button>
        </div>
      </div>
    );
  };

  const renderActions = (msg: Message, i: number) => {
    if (msg.role !== "assistant" || loading || i === 0) return null;

    if (writing && writing.msgIdx === i) {
      if (writing.saved) {
        const slug = slugify(writing.title);
        return (
          <div className="message__actions">
            <Link to={"/page/" + slug} className="write-btn write-btn--done">
              已保存
            </Link>
          </div>
        );
      }
      return (
        <div className="message__actions">
          {renderWriteForm()}
        </div>
      );
    }

    return (
      <div className="message__actions">
        <button
          className="write-btn write-btn--trigger"
          onClick={() => handleWriteClick(i, msg)}
        >
          写入 Wiki
        </button>
      </div>
    );
  };

  return (
    <div className="ask-page">
      <h1>问 Wiki</h1>
      <p className="ask-page__desc">基于已编译的 Wiki 知识回答问题。</p>

      <div className="ask-page__messages">
        {messages.map((msg, i) => (
          <div key={i} className={"message message--" + msg.role}>
            <div className="message__avatar">
              {msg.role === "user" ? "🧑" : "🤖"}
            </div>
            <div className="message__body">
              <div className="message__content markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="message__sources">
                  来源:{" "}
                  {msg.sources.map((s) => (
                    <Link key={s} to={"/page/" + s} className="source-tag">
                      {s}
                    </Link>
                  ))}
                </div>
              )}
              {renderActions(msg, i)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message message--assistant">
            <div className="message__avatar">🤖</div>
            <div className="message__body">
              <div className="message__content thinking">思考中...</div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="ask-page__input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="输入你的问题..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
