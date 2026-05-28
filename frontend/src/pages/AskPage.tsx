import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { chatWithWiki, putPage } from "../api/client";

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

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState<{
    msgIdx: number;
    title: string;
    content: string;
    saving: boolean;
    saved: boolean;
    error: string;
    slug: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

    try {
      const history = updatedMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      const res = await chatWithWiki(history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, sources: res.sources },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ 请求失败: " + e.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleWriteClick = (msgIdx: number, msg: Message) => {
    if (writing) return;

    const lastQuestion = [...messages]
      .slice(0, msgIdx)
      .reverse()
      .find((m) => m.role === "user");

    const cleaned = lastQuestion
      ? lastQuestion.content
          .replace(/^(什么是|介绍|解释|请|能否|帮我|把|将|写入|添加到)\s*/i, "")
          .slice(0, 30)
      : "新知识";
    const title = cleaned || "新知识";

    setWriting({
      msgIdx,
      title,
      content: msg.content,
      saving: false,
      saved: false,
      error: "",
      slug: "",
    });
  };

  const handleWriteSave = async () => {
    if (!writing) return;
    setWriting((w) => w ? { ...w, saving: true, error: "" } : null);
    try {
      const slug = slugify(writing.title);
      await putPage(slug, writing.content);
      setWriting((w) => w ? { ...w, saving: false, saved: true, error: "", slug } : null);
    } catch (e: any) {
      setWriting((w) => w ? { ...w, saving: false, error: e.message } : null);
    }
  };

  const handleWriteCancel = () => setWriting(null);

  const renderActions = (msg: Message, i: number) => {
    if (msg.role !== "assistant" || loading) return null;

    if (writing && writing.msgIdx === i) {
      if (writing.saved) {
        return (
          <div className="message__actions">
            <Link to={"/page/" + writing.slug} className="write-btn write-btn--done">
              ✅ 已保存 - 查看
            </Link>
          </div>
        );
      }
      return (
        <div className="message__actions">
          <div className="write-form">
            <div className="write-form__hint">
              编辑内容后保存到 Wiki。可以修改标题和补充你自己的知识。
            </div>
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
              rows={8}
              disabled={writing.saving}
            />
            {writing.error && (
              <div className="write-form__error">{writing.error}</div>
            )}
            <div className="write-form__btns">
              <button
                className="write-btn write-btn--save"
                onClick={handleWriteSave}
                disabled={writing.saving || !writing.title.trim() || !writing.content.trim()}
              >
                {writing.saving ? "保存中..." : "💾 保存到 Wiki"}
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
        </div>
      );
    }

    return (
      <div className="message__actions">
        <button
          className="write-btn write-btn--trigger"
          onClick={() => handleWriteClick(i, msg)}
        >
          📝 写入 Wiki
        </button>
      </div>
    );
  };

  return (
    <div className="ask-page">
      <h1>💬 对话</h1>
      <p className="ask-page__desc">
        与 LLM 对话，讨论 wiki 知识，并将新内容写入 wiki。
      </p>

      <div className="ask-page__messages">
        {messages.length === 0 && (
          <div className="message message--assistant">
            <div className="message__avatar">🤖</div>
            <div className="message__body">
              <div className="message__content markdown-body">
                <p>你好！我可以：</p>
                <ul>
                  <li>回答关于已有 wiki 知识的问题</li>
                  <li>讨论你希望补充到 wiki 的新知识</li>
                  <li>协助你将讨论结果整理成 wiki 页面</li>
                </ul>
                <p>试试说：<em>"帮我把关于 XX 的知识整理到 wiki"</em></p>
              </div>
            </div>
          </div>
        )}

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
          placeholder="输入消息..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
