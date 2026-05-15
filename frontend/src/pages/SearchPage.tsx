import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SearchHit } from "../api/client";
import { searchWiki } from "../api/client";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    searchWiki(query)
      .then((r) => setResults(r.results))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="search-page">
      <h1>🔍 搜索</h1>

      {!searched && !query && (
        <div className="empty">输入关键词搜索 Wiki 内容</div>
      )}

      {loading && <div className="loading">搜索中...</div>}

      {!loading && searched && (
        <>
          <p className="search-page__info">
            找到 {results.length} 个结果
            {query && <span> — 关键词: "{query}"</span>}
          </p>

          {results.length === 0 ? (
            <div className="empty">没有找到匹配结果</div>
          ) : (
            <div className="search-results">
              {results.map((r) => (
                <Link
                  key={r.slug}
                  to={`/page/${r.slug}`}
                  className="search-result-card"
                >
                  <h3>{r.title}</h3>
                  <p className="search-result-card__snippet">{r.snippet}</p>
                  <span className="search-result-card__score">
                    相关度: {r.score}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
