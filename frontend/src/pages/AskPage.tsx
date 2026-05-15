import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { queryWiki } from "../api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
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
        { role: "assistant", content: `❌ 查询失败: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ask-page">
      <h1>💬 问 Wiki</h1>
      <p className="ask-page__desc">基于已编译的 Wiki 知识回答问题。</p>

      <div className="ask-page__messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message--${msg.role}`}>
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
                    <Link key={s} to={`/page/${s}`} className="source-tag">
                      {s}
                    </Link>
                  ))}
                </div>
              )}
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
