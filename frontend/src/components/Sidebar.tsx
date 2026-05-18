import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PageSummary } from "../api/client";
import { getPages, healthCheck } from "../api/client";

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function Sidebar({ open, onToggle }: Props) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const fetchPages = () => {
    getPages().then(setPages).catch(console.error);
  };

  const [newSlugs, setNewSlugs] = useState<Set<string>>(new Set());
  const [newTopSlugs, setNewTopSlugs] = useState<string[]>([]);

  useEffect(() => {
    fetchPages();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.created?.length > 0) {
        setNewSlugs(new Set(detail.created));
        setNewTopSlugs(detail.created);
        setTimeout(() => {
          setNewSlugs(new Set());
          setNewTopSlugs([]);
        }, 8000);
      }
      fetchPages();
    };
    window.addEventListener("pages-updated", handler);
    return () => window.removeEventListener("pages-updated", handler);
  }, []);

  // Sort: new pages first, then alphabetical
  const sortedPages = [...pages].sort((a, b) => {
    const aNew = newTopSlugs.includes(a.slug);
    const bNew = newTopSlugs.includes(b.slug);
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    return a.title.localeCompare(b.title, "zh");
  });

  // Poll health status
  useEffect(() => {
    const check = () => {
      healthCheck()
        .then(() => setStatus("online"))
        .catch(() => setStatus("offline"));
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  const [status, setStatus] = useState<"online" | "offline">("online");

  // Theme toggle
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("llmwiki-theme") || "light";
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("llmwiki-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <aside className={`sidebar ${open ? "" : "sidebar--closed"}`}>
      <div className="sidebar__header">
        <Link to="/" className="sidebar__logo">📚 LLM Wiki</Link>
        <button className="sidebar__toggle" onClick={onToggle}>
          {open ? "◀" : "▶"}
        </button>
      </div>

      <form onSubmit={handleSearch} className="sidebar__search">
        <input
          type="text"
          placeholder="搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <nav className="sidebar__nav">
        <Link to="/" className="sidebar__link">🏠 首页</Link>
        <Link to="/sources" className="sidebar__link">📄 源文件</Link>
        <Link to="/graph" className="sidebar__link">🕸️ 知识图谱</Link>
        <Link to="/ask" className="sidebar__link">💬 问 Wiki</Link>
      </nav>

      <div className="sidebar__divider">页面</div>
      <div className="sidebar__pages">
        {sortedPages.map((p) => {
          const isNew = newSlugs.has(p.slug);
          return (
            <Link
              key={p.slug}
              to={`/page/${p.slug}`}
              className={`sidebar__page-link${isNew ? " sidebar__page-link--new" : ""}`}
            >
              {isNew && <span className="new-dot">●</span>}
              <span className={isNew ? "new-title" : ""}>{p.title}</span>
            </Link>
          );
        })}
      </div>

      <div className="sidebar__footer">
        <button className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "切换到浅色" : "切换到深色"}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <span className={`status-dot status-dot--${status}`}></span>
        <span className="status-text">{status === "online" ? "已连接" : "未连接"}</span>
      </div>
    </aside>
  );
}
