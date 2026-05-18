import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GraphData } from "../api/client";
import { getGraph } from "../api/client";

/** 读取当前主题的 CSS 变量值 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const layoutRef = useRef<{
    nodes: Array<{ id: string; label: string; x: number; y: number; edgeCount: number; maxEdge: number }>;
    nodeMap: Map<string, { id: string; label: string; x: number; y: number }>;
  } | null>(null);

  const viewRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartViewRef = useRef({ x: 0, y: 0 });
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getGraph()
      .then(setGraph)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Reset layout when graph data changes
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    layoutRef.current = null;
  }, [graph]);

  // Main rendering
  useEffect(() => {
    if (!graph || !canvasRef.current || graph.nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { W, H };
    };

    let { W, H } = resizeCanvas();

    // Build layout only once
    if (!layoutRef.current) {
      const centerX = W / 2;
      const centerY = H / 2;
      const radius = Math.min(W, H) * 0.35;

      const edgeCount = new Map<string, number>();
      for (const n of graph.nodes) edgeCount.set(n.id, 0);
      for (const e of graph.edges) {
        edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
        edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
      }
      const maxEdges = Math.max(...Array.from(edgeCount.values()), 1);

      const nds = graph.nodes.map((n, i) => ({
        id: n.id,
        label: n.label,
        x: centerX + radius * Math.cos((2 * Math.PI * i) / graph.nodes.length),
        y: centerY + radius * Math.sin((2 * Math.PI * i) / graph.nodes.length),
        vx: 0, vy: 0,
        edgeCount: edgeCount.get(n.id) || 0,
        maxEdge: maxEdges,
      }));
      const nodeMap = new Map(nds.map((n) => [n.id, n]));

      // Force simulation
      const REP = 10000, ATTR = 0.004, DAMP = 0.85, ITER = 150;
      for (let iter = 0; iter < ITER; iter++) {
        for (let i = 0; i < nds.length; i++) {
          for (let j = i + 1; j < nds.length; j++) {
            const dx = nds[j].x - nds[i].x;
            const dy = nds[j].y - nds[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
            const force = REP / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nds[i].vx -= fx; nds[i].vy -= fy;
            nds[j].vx += fx; nds[j].vy += fy;
          }
        }
        for (const edge of graph.edges) {
          const s = nodeMap.get(edge.source);
          const t = nodeMap.get(edge.target);
          if (!s || !t) continue;
          const dx = t.x - s.x, dy = t.y - s.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (dist - 120) * ATTR;
          s.vx += (dx / dist) * force; s.vy += (dy / dist) * force;
          t.vx -= (dx / dist) * force; t.vy -= (dy / dist) * force;
        }
        for (const n of nds) {
          n.vx += (centerX - n.x) * 0.001;
          n.vy += (centerY - n.y) * 0.001;
          n.vx *= DAMP; n.vy *= DAMP;
          n.x += n.vx; n.y += n.vy;
        }
      }

      layoutRef.current = {
        nodes: nds.map(({ id, label, x, y, edgeCount, maxEdge }) => ({ id, label, x, y, edgeCount, maxEdge })),
        nodeMap,
      };
    }

    const { nodes, nodeMap } = layoutRef.current;
    const view = viewRef.current;

    // ─── Drawing ──────────────────────────────────────────────────
    const draw = () => {
      ctx!.clearRect(0, 0, W, H);
      ctx!.save();
      ctx!.translate(view.offsetX, view.offsetY);
      ctx!.scale(view.scale, view.scale);

      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      const edgeColor = cssVar("--text-secondary");
      const textColor = cssVar("--text-primary");
      const maxE = Math.max(...nodes.map((n) => n.edgeCount), 1);

      // Edges
      ctx!.lineWidth = Math.max(0.6, 0.6 / view.scale);
      for (const edge of graph!.edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        ctx!.strokeStyle = edgeColor;
        ctx!.globalAlpha = 0.35;
        ctx!.beginPath();
        ctx!.moveTo(s.x, s.y);
        ctx!.lineTo(t.x, t.y);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;

      // Nodes
      for (const node of nodes) {
        const ratio = node.edgeCount / maxE;
        const r = Math.max(4, 4 + ratio * 14);
        const hue = 205 - ratio * 35;

        let fill: string, stroke: string;
        if (isDark) {
          fill = `hsl(${hue}, 70%, ${42 + ratio * 20}%)`;
          stroke = `hsl(${hue}, 60%, ${58 + ratio * 15}%)`;
        } else {
          fill = `hsl(${hue}, 55%, ${40 - ratio * 8}%)`;
          stroke = `hsl(${hue}, 50%, ${30 - ratio * 5}%)`;
        }

        ctx!.beginPath();
        ctx!.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx!.fillStyle = fill;
        ctx!.fill();
        ctx!.strokeStyle = stroke;
        ctx!.lineWidth = Math.max(1, 1.5 / view.scale);
        ctx!.stroke();

        // Label
        const labelSize = Math.max(10, 10 + ratio * 5);
        ctx!.fillStyle = textColor;
        ctx!.font = `${labelSize}px sans-serif`;
        ctx!.textAlign = "center";
        ctx!.fillText(node.label, node.x, node.y + r + labelSize + 3);
      }

      ctx!.restore();
    };

    draw();
    drawRef.current = draw;

    // ─── Theme Change Observer ────────────────────────────────────
    const observer = new MutationObserver(() => {
      // Redraw when data-theme changes
      if (drawRef.current) drawRef.current();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // ─── Hit test ─────────────────────────────────────────────────
    const hitTest = (sx: number, sy: number) => {
      const gx = (sx - view.offsetX) / view.scale;
      const gy = (sy - view.offsetY) / view.scale;
      for (const node of nodes) {
        const dx = gx - node.x, dy = gy - node.y;
        if (dx * dx + dy * dy < 400 / (view.scale * view.scale)) return node;
      }
      return null;
    };

    // ─── Events ───────────────────────────────────────────────────
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.max(0.2, Math.min(5, view.scale * delta));
      view.offsetX = e.offsetX - (e.offsetX - view.offsetX) * (ns / view.scale);
      view.offsetY = e.offsetY - (e.offsetY - view.offsetY) * (ns / view.scale);
      view.scale = ns;
      draw();
    };

    const mousedown = (e: MouseEvent) => {
      dragStartRef.current = { x: e.offsetX, y: e.offsetY };
      dragStartViewRef.current = { x: view.offsetX, y: view.offsetY };
      if (hitTest(e.offsetX, e.offsetY)) return;
      draggingRef.current = true;
      canvas.style.cursor = "grabbing";
    };

    const mousemove = (e: MouseEvent) => {
      if (!draggingRef.current) {
        canvas.style.cursor = hitTest(e.offsetX, e.offsetY) ? "pointer" : "grab";
        return;
      }
      view.offsetX = dragStartViewRef.current.x + e.offsetX - dragStartRef.current.x;
      view.offsetY = dragStartViewRef.current.y + e.offsetY - dragStartRef.current.y;
      draw();
    };

    const mouseup = () => { draggingRef.current = false; canvas.style.cursor = "grab"; };

    const click = (e: MouseEvent) => {
      if (Math.abs(e.offsetX - dragStartRef.current.x) > 5 || Math.abs(e.offsetY - dragStartRef.current.y) > 5) return;
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) navigate(`/page/${hit.id}`);
    };

    const dblclick = () => { view.offsetX = 0; view.offsetY = 0; view.scale = 1; draw(); };

    const resize = () => {
      const s = resizeCanvas();
      W = s.W; H = s.H;
      layoutRef.current = null;
      draw();
    };

    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("mousedown", mousedown);
    canvas.addEventListener("mousemove", mousemove);
    canvas.addEventListener("mouseup", mouseup);
    canvas.addEventListener("mouseleave", mouseup);
    canvas.addEventListener("click", click);
    canvas.addEventListener("dblclick", dblclick);
    window.addEventListener("resize", resize);

    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("mousedown", mousedown);
      canvas.removeEventListener("mousemove", mousemove);
      canvas.removeEventListener("mouseup", mouseup);
      canvas.removeEventListener("mouseleave", mouseup);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("dblclick", dblclick);
      window.removeEventListener("resize", resize);
    };
  }, [graph, navigate]);

  if (loading) return <div className="loading">加载中...</div>;
  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="graph-page">
        <h1>🕸️ 知识图谱</h1>
        <div className="empty">暂无数据，先创建一些页面吧。</div>
      </div>
    );
  }

  return (
    <div className="graph-page">
      <div className="graph-page__header">
        <h1>🕸️ 知识图谱</h1>
        <p className="graph-page__info">
          {graph.nodes.length} 个节点 · {graph.edges.length} 条连接
          <span className="graph-page__hint">滚轮缩放 · 拖拽平移 · 双击重置 · 点击跳转</span>
        </p>
      </div>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
