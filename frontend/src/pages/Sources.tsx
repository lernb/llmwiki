import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import type { SourceSummary, IngestResult } from "../api/client";
import { getSources, uploadSource, deleteSource, ingestSource, ingestAllSources } from "../api/client";

export default function Sources() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState<string | "all" | null>(null);
  const [log, setLog] = useState<IngestResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchSources = () => {
    setLoading(true);
    getSources()
      .then(setSources)
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

  const handleIngest = async (filename: string) => {
    setIngesting(filename);
    try {
      const result = await ingestSource(filename);
      setLog((prev) => [result, ...prev]);
      fetchSources();
    } catch (e: any) {
      alert("消化失败: " + e.message);
    } finally {
      setIngesting(null);
    }
  };

  const handleIngestAll = async () => {
    setIngesting("all");
    try {
      const res = await ingestAllSources();
      setLog((prev) => [...res.results, ...prev]);
      fetchSources();
    } catch (e: any) {
      alert("批量消化失败: " + e.message);
    } finally {
      setIngesting(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="sources">
      <h1>📄 源文件</h1>
      <p className="sources__desc">上传原始文档，LLM 将读取并编译为 Wiki 页面。</p>

      <div className="sources__upload">
        <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.html" />
        <button onClick={handleUpload} disabled={uploading}>
          {uploading ? "上传中..." : "上传"}
        </button>
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
            <button
              className="btn-primary"
              onClick={handleIngestAll}
              disabled={ingesting !== null}
            >
              {ingesting === "all" ? "消化中..." : "🧠 消化全部"}
            </button>
          </div>

          <table className="sources__table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.filename}>
                  <td>{s.filename}</td>
                  <td>{formatSize(s.size)}</td>
                  <td className="sources__actions">
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleIngest(s.filename)}
                      disabled={ingesting === s.filename}
                    >
                      {ingesting === s.filename ? "消化中..." : "🧠 消化"}
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDelete(s.filename)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
