import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import type { SourceSummary, IngestResult } from "../api/client";
import { getSources, uploadSource, deleteSource, ingestSource, ingestAllSources } from "../api/client";

// Extended source info with ingestion status from backend
interface SourceItem extends SourceSummary {
  ingested: boolean;
  lastIngested: number | null;
  ingestStatus: string | null;
}

export default function Sources() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // Track multiple concurrent ingest operations
  const [ingestingSet, setIngestingSet] = useState<Set<string>>(new Set());
  const [ingestingAll, setIngestingAll] = useState(false);
  const [log, setLog] = useState<IngestResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.max(1, Math.ceil(sources.length / pageSize));
  const pagedSources = sources.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when sources change
  useEffect(() => { setPage(1); }, [sources.length]);

  const fetchSources = () => {
    setLoading(true);
    getSources()
      .then((data) => {
        const items = data as unknown as SourceItem[];
        // Newest first
        items.sort((a, b) => b.updated - a.updated);
        setSources(items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSources(); }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadSource(file);
      if (fileRef.current) fileRef.current.value = "";
      fetchSources();
    } catch (e: any) {
      alert("上传失败: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`删除 "${filename}"？`)) return;
    try {
      await deleteSource(filename);
      fetchSources();
    } catch (e: any) {
      alert("删除失败: " + e.message);
    }
  };

  const notifyPagesUpdated = (createdSlugs: string[] = []) => {
    window.dispatchEvent(
      new CustomEvent("pages-updated", { detail: { created: createdSlugs } })
    );
  };

  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const handleIngest = async (filename: string, isReingest: boolean) => {
    if (isReingest && !confirm(`"${filename}" 已消化过，确定要重新消化吗？`)) return;
    if (!isReingest && !confirm(`确定要消化 "${filename}" 吗？这将消耗 API 额度。`)) return;
    setIngestingSet((prev) => new Set(prev).add(filename));
    try {
      const result = await ingestSource(filename);
      setLog((prev) => [result, ...prev]);
      fetchSources();
      notifyPagesUpdated(result.pagesCreated);
    } catch (e: any) {
      alert("消化失败: " + e.message);
    } finally {
      setIngestingSet((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  };

  const handleCancel = async (filename: string) => {
    setCancelling((prev) => new Set(prev).add(filename));
    try {
      await fetch(`/api/ingest/cancel/${encodeURIComponent(filename)}`, { method: "POST" });
      setIngestingSet((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
      fetchSources();
    } catch {
      // ignore
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  };

  const handleIngestAll = async () => {
    if (!confirm(`确定要消化全部 ${sources.length} 个源文件吗？这将消耗 API 额度。`)) return;
    setIngestingAll(true);
    try {
      const res = await ingestAllSources();
      setLog((prev) => [...res.results, ...prev]);
      fetchSources();
      const allCreated = res.results.flatMap((r) => r.pagesCreated);
      notifyPagesUpdated(allCreated);
    } catch (e: any) {
      alert("批量消化失败: " + e.message);
    } finally {
      setIngestingAll(false);
    }
  };

  const isIngesting = (filename: string) => ingestingSet.has(filename);
  const anyIngesting = ingestingSet.size > 0 || ingestingAll;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="sources">
      <h1>📄 源文件</h1>
      <p className="sources__desc">上传原始文档，LLM 将读取并编译为 Wiki 页面。</p>

      <div className="sources__upload">
        <label className="upload-btn">
          {uploading ? "上传中..." : "📁 选择文件并上传"}
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.html"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : sources.length === 0 ? (
        <div className="empty">
          <p>暂无源文件，上传一些文档开始吧。</p>
          <p style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 14 }}>
            支持 .txt、.md、.pdf 格式
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            {ingestingAll ? (
              <button
                className="btn-ingesting-all"
                onClick={() => fetch("/api/ingest/cancel-all", { method: "POST" })}
              >
                ⏹ 停止全部
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleIngestAll}
                disabled={anyIngesting}
              >
                🧠 消化全部
              </button>
            )}
          </div>

          <table className="sources__table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedSources.map((s) => (
                <tr key={s.filename}>
                  <td>
                    <span className="filename-text">{s.filename}</span>
                    {s.ingested && (
                      <span className="source-badge source-badge--done">已消化</span>
                    )}
                  </td>
                  <td>{formatSize(s.size)}</td>
                  <td className="sources__status-cell">
                    {isIngesting(s.filename) ? (
                      <span className="source-status source-status--ingesting">⏳ 消化中...</span>
                    ) : s.ingested ? (
                      <span>✅ {formatTime(s.lastIngested)}</span>
                    ) : (
                      <span className="source-status source-status--pending">⏳ 待消化</span>
                    )}
                  </td>
                  <td className="sources__actions">
                    {isIngesting(s.filename) ? (
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleCancel(s.filename)}
                        disabled={cancelling.has(s.filename)}
                      >
                        停止
                      </button>
                    ) : (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => handleIngest(s.filename, s.ingested)}
                        disabled={ingestingAll}
                      >
                        {s.ingested ? "🔄 重新消化" : "🧠 消化"}
                      </button>
                    )}
                    <a
                      href={`/api/sources/${encodeURIComponent(s.filename)}/download`}
                      className="btn-download btn-sm"
                      download={s.filename}
                    >
                      下载
                    </a>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDelete(s.filename)}
                      disabled={isIngesting(s.filename)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {sources.length > 0 && (
            <div className="pagination">
              <div className="pagination__info">
                共 {sources.length} 条，第 {page}/{totalPages} 页
              </div>
              <div className="pagination__controls">
                <button
                  className="pagination__btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`pagination__btn${pageNum === page ? " pagination__btn--active" : ""}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  className="pagination__btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                </button>
              </div>
              <div className="pagination__size">
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10条/页</option>
                  <option value={20}>20条/页</option>
                  <option value={50}>50条/页</option>
                  <option value={100}>100条/页</option>
                </select>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ingestion Log */}
      {log.length > 0 && (
        <section className="sources__log">
          <h2>消化日志</h2>
          {log.map((r, i) => (
            <div
              key={i}
              className={`log-entry ${r.status === "success" ? "log-entry--success" : "log-entry--error"}`}
            >
              <div className="log-entry__header">
                <strong>{r.sourceFile}</strong>
                <span className={`log-status log-status--${r.status}`}>{r.status}</span>
              </div>
              <p className="log-entry__msg">{r.message}</p>
              {(r.pagesCreated.length > 0 || r.pagesUpdated.length > 0) && (
                <div className="log-entry__pages">
                  {r.pagesCreated.map((s) => (
                    <Link key={s} to={`/page/${s}`} className="log-page-link">+ {s}</Link>
                  ))}
                  {r.pagesUpdated.map((s) => (
                    <Link key={s} to={`/page/${s}`} className="log-page-link">~ {s}</Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
