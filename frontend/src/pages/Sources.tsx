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
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [pendingPage, setPendingPage] = useState(1);
  const [ingestedPage, setIngestedPage] = useState(1);
  const PAGE_SIZE = 10;
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset pagination when sources change
  useEffect(() => { setPendingPage(1); setIngestedPage(1); }, [sources.length]);

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

  const handleIngestAll = async (files?: string[]) => {
    const isReingest = files === ingestedFiles;
    const count = files?.length ?? sources.length;
    const label = isReingest ? `重新消化全部 ${count} 个已消化的源文件` : `消化全部 ${count} 个待消化的源文件`;
    if (!confirm(`确定要${label}吗？这将消耗 API 额度。`)) return;
    setIngestingAll(true);
    try {
      const res = files
        ? { results: await Promise.all(files.map((f) => ingestSource(f))) }
        : await ingestAllSources();
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

  const pendingItems = sources.filter((s) => !s.ingested);
  const ingestedItems = sources.filter((s) => s.ingested);
  const pendingFiles = pendingItems.map((s) => s.filename);
  const ingestedFiles = ingestedItems.map((s) => s.filename);
  const pagedPending = pendingItems.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);
  const pagedIngested = ingestedItems.slice((ingestedPage - 1) * PAGE_SIZE, ingestedPage * PAGE_SIZE);

  const PaginationBar = ({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="pagination">
        <div className="pagination__info">第 {page} / {total} 页</div>
        <div className="pagination__controls">
          <button className="pagination__btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
          <button className="pagination__btn" disabled={page >= total} onClick={() => onChange(page + 1)}>下一页</button>
        </div>
      </div>
    );
  };

  const renderTable = (items: SourceItem[], title: string, allFilenames: string[]) => {
    if (items.length === 0) return null;
    const anyItemIngesting = items.some((s) => ingestingSet.has(s.filename));

    return (
      <div className="sources-group" key={title}>
        <div className="sources-group__header">
          <h2>{title}（{items.length}）</h2>
          {anyItemIngesting || ingestingAll ? null : (
            <button
              className="btn-group"
              onClick={() => handleIngestAll(allFilenames)}
              disabled={anyIngesting}
            >
              {allFilenames === pendingFiles ? "全部消化" : "全部重新消化"}
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
            {items.map((s) => (
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
      </div>
    );
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
          {ingestingAll && (
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn-group-stop"
                onClick={() => fetch("/api/ingest/cancel-all", { method: "POST" })}
              >
                ⏹ 停止全部消化
              </button>
            </div>
          )}

          {renderTable(pagedPending, "📤 待消化", pendingFiles)}
          <PaginationBar page={pendingPage} total={Math.ceil(pendingItems.length / PAGE_SIZE)} onChange={setPendingPage} />
          {renderTable(pagedIngested, "✅ 已消化", ingestedFiles)}
          <PaginationBar page={ingestedPage} total={Math.ceil(ingestedItems.length / PAGE_SIZE)} onChange={setIngestedPage} />

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
                    <span className={`log-status log-status--${r.status}`}>
                      {r.status === "success" ? "完成" : r.status === "cancelled" ? "已取消" : "失败"}
                    </span>
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
        </>
      )}

    </div>
  );
}
