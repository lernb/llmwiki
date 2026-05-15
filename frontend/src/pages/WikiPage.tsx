import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PageDetail } from "../api/client";
import { getPage } from "../api/client";

export default function WikiPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    getPage(slug)
      .then(setPage)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">❌ {error}</div>;
  if (!page) return <div className="error">页面不存在</div>;

  // Render wiki links [[target]] as React Router links
  const renderContent = (content: string) => {
    // Transform [[Wiki Link]] → markdown links before rendering
    const transformed = content.replace(
      /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g,
      (_match, target: string, display?: string) => {
        const slug = target.trim().toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
        const text = display?.trim() || target.trim();
        return `[${text}](/page/${slug})`;
      }
    );
    return transformed;
  };

  return (
    <article className="wiki-page">
      <header className="wiki-page__header">
        <h1>{page.title}</h1>
      </header>

      <div className="wiki-page__content markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {renderContent(page.content)}
        </ReactMarkdown>
      </div>

      {/* Backlinks */}
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
  );
}
