import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PageSummary, GraphData } from "../api/client";
import { getPages, getGraph } from "../api/client";

export default function Home() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPages(), getGraph()])
      .then(([p, g]) => {
        setPages(p);
        setGraph(g);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">加载中...</div>;

  const recentPages = [...pages].sort((a, b) => b.updated - a.updated).slice(0, 5);
  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <div className="home">
      <h1>📚 LLM Wiki</h1>
      <p className="home__subtitle">
        持久化知识库 — 由 LLM 编译，持续积累
      </p>

      <div className="home__stats">
        <div className="stat-card">
          <span className="stat-number">{pages.length}</span>
          <span className="stat-label">页面</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{nodeCount}</span>
          <span className="stat-label">知识节点</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{edgeCount}</span>
          <span className="stat-label">连接</span>
        </div>
      </div>

      {recentPages.length > 0 && (
        <section className="home__section">
          <h2>最近页面</h2>
          <div className="page-list">
            {recentPages.map((p) => (
              <Link key={p.slug} to={`/page/${p.slug}`} className="page-card">
                <span className="page-card__title">{p.title}</span>
                <span className="page-card__meta">
                  {Math.round(p.size / 100) / 10} KB
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="home__section home__getting-started">
        <h2>快速开始</h2>
        <ol>
          <li>前往 <Link to="/sources">📄 源文件</Link> 上传文档（论文、文章、笔记）</li>
          <li>运行 <strong>Ingest</strong> 让 LLM 读取并编译成 Wiki 页面</li>
          <li>浏览互联的 Wiki 页面，观察知识图谱的增长</li>
        </ol>
      </section>
    </div>
  );
}
