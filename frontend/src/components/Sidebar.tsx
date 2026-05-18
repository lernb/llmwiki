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

  useEffect(() => {
    getPages().then(setPages).catch(console.error);
  }, []);

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
        {pages.map((p) => (
          <Link
            key={p.slug}
            to={`/page/${p.slug}`}
            className="sidebar__page-link"
          >
            {p.title}
          </Link>
        ))}
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
