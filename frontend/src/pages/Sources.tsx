import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import type { SourceSummary, IngestResult } from "../api/client";
import { getSources, uploadSource, deleteSource, ingestSource, ingestAllSources } from "../api/client";

export default function Sources() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ingestingSet, setIngestingSet] = useState<Set<string>>(new Set());
  const [ingestingAll, setIngestingAll] = useState(false);
  const [log, setLog] = useState<IngestResult[]>([]);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [pendingPage, setPendingPage] = useState(1);
  const [ingestedPage, setIngestedPage] = useState(1);
  const PAGE_SIZE = 10;
  const fileRef = useRef<HTMLInputElement>(null);

  // Custom dialogs
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: string;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    filename: string;
    hasPages: boolean;
  } | null>(null);

  // Reset pagination when sources change
  useEffect(() => { setPendingPage(1); setIngestedPage(1); }, [sources.length]);

  const fetchSources = () => {
    setLoading(true);
    getSources()
      .then((data) => {
        data.sort((a, b) => b.updated - a.updated);
        setSources(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSources(); }, []);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadSource(file);
      }
      if (fileRef.current) fileRef.current.value = "";
      fetchSources();
    } catch (e: any) {
      alert("上传失败: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string, ingested: boolean) => {
    if (ingested) {
      setDeleteTarget({ filename, hasPages: true });
    } else {
      setDeleteTarget({ filename, hasPages: false });
    }
  };

  const notifyPagesUpdated = (createdSlugs: string[] = []) => {
    window.dispatchEvent(
      new CustomEvent("pages-updated", { detail: { created: createdSlugs } })
    );
  };

  const handleIngest = async (filename: string, isReingest: boolean) => {
    const doIngest = () => {
      setIngestingSet((prev) => new Set(prev).add(filename));
      ingestSource(filename)
        .then((result) => {
          setLog((prev) => [result, ...prev]);
          fetchSources();
          notifyPagesUpdated(result.pagesCreated);
        })
        .catch((e: any) => {
          setLog((prev) => [{
            status: "error",
            message: e.message || "消化失败",
            pagesCreated: [],
            pagesUpdated: [],
            sourceFile: filename,
          }, ...prev]);
        })
        .finally(() => {
          setIngestingSet((prev) => {
            const next = new Set(prev);
            next.delete(filename);
            return next;
          });
        });
    };

    if (isReingest) {
      setConfirmAction({
        message: `「${filename}」已消化过，确定要重新消化吗？已创建的 Wiki 页面将被覆盖。`,
        onConfirm: doIngest,
        confirmLabel: "确认重新消化",
        variant: "danger",
      });
    } else {
      setConfirmAction({
        message: `确定要消化「${filename}」吗？这将消耗 API 额度。`,
        onConfirm: doIngest,
        confirmLabel: "确认消化",
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

    setConfirmAction({
      message: `确定要${label}吗？${isReingest ? "已创建的 Wiki 页面将被覆盖。" : "这将消耗 API 额度。"}`,
      onConfirm: async () => {
        setIngestingAll(true);
        setConfirmAction(null);
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
      },
      confirmLabel: isReingest ? "确认全部重新消化" : "确认全部消化",
      variant: isReingest ? "danger" : "primary",
    });
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

  const renderTable = (items: SourceSummary[], title: string, allFilenames: string[], totalCount?: number) => {
    if (items.length === 0) return null;
    const anyItemIngesting = items.some((s) => ingestingSet.has(s.filename));
    const count = totalCount ?? items.length;

    return (
      <div className="sources-group" key={title}>
        <div className="sources-group__header">
          <h2>{title}（{count}）</h2>
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
                  {isOfficeBinary(s.filename) && (
                    <span className="source-badge source-badge--warn" title="建议使用纯文本（.txt）、Markdown（.md）、PDF 或图片格式以获得最佳效果">格式提醒</span>
                  )}
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
                      title={isOfficeBinary(s.filename) ? "建议使用纯文本/PDF/图片格式以获得更好效果" : undefined}
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
                    onClick={() => handleDelete(s.filename, s.ingested)}
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

  const OFFICE_EXTS = new Set([".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".vsdx", ".vsd", ".odt", ".ods", ".odp"]);
  const isOfficeBinary = (name: string) => {
    const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
    return OFFICE_EXTS.has(ext);
  };

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

          {renderTable(pagedPending, "📤 待消化", pendingFiles, pendingItems.length)}
          <PaginationBar page={pendingPage} total={Math.ceil(pendingItems.length / PAGE_SIZE)} onChange={setPendingPage} />
          {renderTable(pagedIngested, "✅ 已消化", ingestedFiles, ingestedItems.length)}
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

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="chat__confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="chat__confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>{confirmAction.message}</p>
            <div className="chat__confirm-actions">
              <button className="chat__btn" onClick={() => setConfirmAction(null)}>取消</button>
              <button className={`chat__btn chat__btn--${confirmAction.variant || "primary"}`} onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}>
                {confirmAction.confirmLabel || "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dialog with choice */}
      {deleteTarget && (
        <div className="chat__confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="chat__confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>删除源文件「{deleteTarget.filename}」后，对应的 Wiki 页面如何处理？</p>
            <div className="sources__delete-choices">
              <button className="chat__btn chat__btn--block" onClick={() => {
                deleteSource(deleteTarget.filename).then(fetchSources);
                setDeleteTarget(null);
              }}>
                仅删除源文件，保留 Wiki 页面
              </button>
              {deleteTarget.hasPages && (
                <button className="chat__btn chat__btn--danger chat__btn--block" onClick={() => {
                  deleteSource(deleteTarget.filename, { deletePages: true }).then(fetchSources);
                  setDeleteTarget(null);
                }}>
                  一并删除源文件和对应的 Wiki 页面
                </button>
              )}
              <button className="chat__btn chat__btn--block" style={{ marginTop: 8 }} onClick={() => setDeleteTarget(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
