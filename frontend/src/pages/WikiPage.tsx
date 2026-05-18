import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { PageDetail } from "../api/client";
import { getPage } from "../api/client";

interface TocItem {
  level: number;
  text: string;
  id: string;
}

export default function WikiPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");

    getPage(slug)
      .then(setPage)
      .catch(async () => {
        try {
          const res = await fetch(`/api/pages/resolve?ref=${encodeURIComponent(slug)}`);
          const data = await res.json();
          if (data.found && data.slug !== slug) {
            navigate(`/page/${data.slug}`, { replace: true });
            return;
          }
          setError(`页面 "${slug}" 不存在`);
        } catch {
          setError(`页面 "${slug}" 不存在`);
        }
      })
      .finally(() => setLoading(false));
  }, [slug, navigate]);

  // Build TOC from headings
  const toc = useMemo(() => {
    if (!page) return [];
    const items: TocItem[] = [];
    const headingRe = /^(#{1,3})\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(page.content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
      items.push({ level, text, id });
    }
    return items;
  }, [page]);

  // Render wiki links
  const renderContent = (content: string) => {
    const resolvedSet = new Set(
      (page?.links || []).filter((l) => l.resolved).map((l) => l.target)
    );

    const transformed = content.replace(
      /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g,
      (_match, target: string, display?: string) => {
        const slug = target.trim().toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
        const text = display?.trim() || target.trim();
        if (resolvedSet.has(slug)) {
          return `[${text}](/page/${slug})`;
        }
        return `<span class="wiki-link-unresolved">${text}</span>`;
      }
    );
    return transformed;
  };

  // Generate heading id from React children
  const getHeadingId = (children: React.ReactNode): string => {
    const text = extractText(children);
    return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  };

  const extractText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node && typeof node === "object" && "props" in node) {
      return extractText((node as any).props.children);
    }
    return "";
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">❌ {error}</div>;
  if (!page) return <div className="error">页面不存在</div>;

  return (
    <div className="wiki-page-layout">
      <article className="wiki-page">
        <header className="wiki-page__header">
          <h1>{page.title}</h1>
        </header>

        <div className="wiki-page__content markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              h1: ({ children, ...props }) => <h1 id={getHeadingId(children)} {...props}>{children}</h1>,
              h2: ({ children, ...props }) => <h2 id={getHeadingId(children)} {...props}>{children}</h2>,
              h3: ({ children, ...props }) => <h3 id={getHeadingId(children)} {...props}>{children}</h3>,
            }}
          >
            {renderContent(page.content)}
          </ReactMarkdown>
        </div>

        {page.backlinks.length > 0 && (
          <section className="wiki-page__backlinks">
            <h2>反向链接</h2>
            <ul>
              {page.backlinks.map((bl) => (
                <li key={bl.slug}>
                  <Link to={`/page/${bl.slug}`}>{bl.title}</Link>
                  <span className="backlink-context"> — {bl.context}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {toc.length > 1 && (
        <aside className="wiki-page-toc">
          <h3 className="toc-title">本页目录</h3>
          <nav className="toc-nav">
            {toc.map((item, i) => (
              <a
                key={i}
                href={`#${item.id}`}
                className={`toc-link toc-link--h${item.level}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
}
