import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { PageDetail } from "../api/client";
import { getPage } from "../api/client";

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
        // 404 — try resolve Chinese slug → real slug
        try {
          const res = await fetch(`/api/pages/resolve?ref=${encodeURIComponent(slug)}`);
          const data = await res.json();
          if (data.found && data.slug !== slug) {
            // Navigate to the correct slug — React Router will remount with new slug
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

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">❌ {error}</div>;
  if (!page) return <div className="error">页面不存在</div>;

  // Render wiki links [[target]]:
  //   - Resolved links → clickable React Router link
  //   - Unresolved links → gray italic text
  const renderContent = (content: string) => {
    // Build a set of resolved link targets for quick lookup
    const resolvedSet = new Set(
      (page.links || []).filter((l) => l.resolved).map((l) => l.target)
    );

    const transformed = content.replace(
      /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g,
      (_match, target: string, display?: string) => {
        const slug = target.trim().toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
        const text = display?.trim() || target.trim();

        if (resolvedSet.has(slug)) {
          return `[${text}](/page/${slug})`;
        }
        // Unresolved: render as plain gray text
        return `<span class="wiki-link-unresolved">${text}</span>`;
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
