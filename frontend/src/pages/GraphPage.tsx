import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GraphData } from "../api/client";
import { getGraph } from "../api/client";

/** 读取当前主题的 CSS 变量值 */
function cssVar(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  } catch {
    return "#888";
  }
}

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const layoutRef = useRef<{
    nodes: Array<{ id: string; label: string; x: number; y: number; edgeCount: number }>;
    nodeMap: Map<string, { id: string; label: string; x: number; y: number; edgeCount: number }>;
  } | null>(null);

  const viewRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartViewRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    getGraph()
      .then(setGraph)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    layoutRef.current = null;
  }, [graph]);

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
      ctx.scale(dpr, dpr);
      return { W, H };
    };

    let { W, H } = resizeCanvas();

    if (!layoutRef.current) {
      const centerX = W / 2;
      const centerY = H / 2;
      const radius = Math.min(W, H) * 0.35;

      // Count edges per node
      const edgeCount = new Map<string, number>();
      for (const n of graph.nodes) edgeCount.set(n.id, 0);
      for (const e of graph.edges) {
        edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
        edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
      }
      const maxEdges = Math.max(...Array.from(edgeCount.values()), 1);

      const nodes = graph.nodes.map((n, i) => ({
        id: n.id,
        label: n.label,
        x: centerX + radius * Math.cos((2 * Math.PI * i) / graph.nodes.length),
        y: centerY + radius * Math.sin((2 * Math.PI * i) / graph.nodes.length),
        vx: 0,
        vy: 0,
        edgeCount: edgeCount.get(n.id) || 0,
        maxEdges,
      }));

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Force simulation
      const REPULSION = 8000;
      const ATTRACTION = 0.003;
      const DAMPING = 0.85;
      const ITERATIONS = 150;

      for (let iter = 0; iter < ITERATIONS; iter++) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }
        for (const edge of graph.edges) {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) continue;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (dist - 120) * ATTRACTION;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        }
        for (const node of nodes) {
          node.vx += (centerX - node.x) * 0.001;
          node.vy += (centerY - node.y) * 0.001;
          node.vx *= DAMPING;
          node.vy *= DAMPING;
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      layoutRef.current = {
        nodes: nodes.map(({ id, label, x, y, edgeCount, maxEdges }) => ({ id, label, x, y, edgeCount, maxEdges: maxEdges as number })),
        nodeMap,
      };
    }

    const { nodes, nodeMap } = layoutRef.current;
    const view = viewRef.current;

    const draw = () => {
      ctx!.clearRect(0, 0, W, H);
      ctx!.save();
      ctx!.translate(view.offsetX, view.offsetY);
      ctx!.scale(view.scale, view.scale);

      // Edge color from theme
      const edgeColor = cssVar("--border");
      ctx!.strokeStyle = edgeColor;
      ctx!.lineWidth = Math.max(0.8, 0.8 / view.scale);

      for (const edge of graph!.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        ctx!.beginPath();
        ctx!.moveTo(source.x, source.y);
        ctx!.lineTo(target.x, target.y);
        ctx!.stroke();
      }

      // Node: size/color by edge count
      const textColor = cssVar("--text-primary");
      const maxE = Math.max(...nodes.map((n) => n.edgeCount), 1);

      for (const node of nodes) {
        const ratio = node.edgeCount / maxE;
        const r = Math.max(5, 4 + ratio * 12) / Math.max(1, view.scale * 0.7);
        const hue = 205 - ratio * 35;
        const lit = 42 + ratio * 18;
        const isDark = document.documentElement.getAttribute("data-theme") !== "light";

        ctx!.beginPath();
        ctx!.arc(node.x, node.y, r, 0, Math.PI * 2);

        if (isDark) {
          ctx!.fillStyle = `hsl(${hue}, 70%, ${lit}%)`;
          ctx!.strokeStyle = `hsl(${hue}, 60%, ${Math.min(lit + 15, 85)}%)`;
        } else {
          ctx!.fillStyle = `hsl(${hue}, 55%, ${Math.max(lit - 10, 30)}%)`;
          ctx!.strokeStyle = `hsl(${hue}, 50%, ${Math.max(lit - 20, 20)}%)`;
        }
        ctx!.lineWidth = Math.max(1, 1.5 / view.scale);
        ctx!.fill();
        ctx!.stroke();

        // Label
        const labelSize = Math.max(11, 10 + ratio * 4) / Math.max(1, view.scale * 0.7);
        ctx!.fillStyle = textColor;
        ctx!.font = `${labelSize}px sans-serif`;
        ctx!.textAlign = "center";
        ctx!.fillText(node.label, node.x, node.y + r + labelSize + 3);
      }

      ctx!.restore();
    };

    draw();

    // Hit-test
    const hitTest = (sx: number, sy: number) => {
      const gx = (sx - view.offsetX) / view.scale;
      const gy = (sy - view.offsetY) / view.scale;
      for (const node of nodes) {
        const dx = gx - node.x;
        const dy = gy - node.y;
        if (dx * dx + dy * dy < 400 / (view.scale * view.scale)) return node;
      }
      return null;
    };

    // Wheel zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(5, view.scale * delta));
      const mx = e.offsetX;
      const my = e.offsetY;
      view.offsetX = mx - (mx - view.offsetX) * (newScale / view.scale);
      view.offsetY = my - (my - view.offsetY) * (newScale / view.scale);
      view.scale = newScale;
      draw();
    };

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      dragStartRef.current = { x: e.offsetX, y: e.offsetY };
      dragStartViewRef.current = { x: view.offsetX, y: view.offsetY };
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) return;
      draggingRef.current = true;
      canvas.style.cursor = "grabbing";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) {
        canvas.style.cursor = hitTest(e.offsetX, e.offsetY) ? "pointer" : "grab";
        return;
      }
      view.offsetX = dragStartViewRef.current.x + (e.offsetX - dragStartRef.current.x);
      view.offsetY = dragStartViewRef.current.y + (e.offsetY - dragStartRef.current.y);
      draw();
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      canvas.style.cursor = "grab";
    };

    const handleClick = (e: MouseEvent) => {
      if (Math.abs(e.offsetX - dragStartRef.current.x) > 5 || Math.abs(e.offsetY - dragStartRef.current.y) > 5) return;
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) navigate(`/page/${hit.id}`);
    };

    const handleDblClick = () => {
      view.offsetX = 0;
      view.offsetY = 0;
      view.scale = 1;
      draw();
    };

    // Resize handler
    const handleResize = () => {
      const sized = resizeCanvas();
      W = sized.W;
      H = sized.H;
      layoutRef.current = null;
      draw();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("dblclick", handleDblClick);
    window.addEventListener("resize", handleResize);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("dblclick", handleDblClick);
      window.removeEventListener("resize", handleResize);
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
          <span className="graph-page__hint">滚轮缩放 · 拖拽平移 · 双击重置 · 点击节点跳转</span>
        </p>
      </div>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
