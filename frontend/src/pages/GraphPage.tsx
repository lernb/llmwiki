import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GraphData } from "../api/client";
import { getGraph } from "../api/client";

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  // Store graph layout data so it persists across re-renders
  const layoutRef = useRef<{
    nodes: Array<{ id: string; label: string; x: number; y: number }>;
    nodeMap: Map<string, { id: string; label: string; x: number; y: number }>;
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

  // Compute force layout when graph data changes
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    layoutRef.current = null; // force recompute
  }, [graph]);

  // Render the canvas
  useEffect(() => {
    if (!graph || !canvasRef.current || graph.nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Compute layout only once
    if (!layoutRef.current) {
      const centerX = W / 2;
      const centerY = H / 2;
      const radius = Math.min(W, H) * 0.35;

      const nodes = graph.nodes.map((n, i) => ({
        id: n.id,
        label: n.label,
        x: centerX + radius * Math.cos((2 * Math.PI * i) / graph.nodes.length),
        y: centerY + radius * Math.sin((2 * Math.PI * i) / graph.nodes.length),
        vx: 0,
        vy: 0,
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
        }

        for (const node of nodes) {
          node.vx *= DAMPING;
          node.vy *= DAMPING;
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      layoutRef.current = {
        nodes: nodes.map(({ id, label, x, y }) => ({ id, label, x, y })),
        nodeMap,
      };
    }

    const { nodes, nodeMap } = layoutRef.current;
    const view = viewRef.current;

    // Draw function
    const draw = () => {
      ctx!.clearRect(0, 0, W, H);
      ctx!.save();
      ctx!.translate(view.offsetX, view.offsetY);
      ctx!.scale(view.scale, view.scale);

      // Draw edges
      ctx!.strokeStyle = "#555";
      ctx!.lineWidth = 1;
      for (const edge of graph!.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        ctx!.beginPath();
        ctx!.moveTo(source.x, source.y);
        ctx!.lineTo(target.x, target.y);
        ctx!.stroke();
      }

      // Draw nodes
      const nodeRadius = Math.max(6, 6 / view.scale);
      const fontSize = Math.max(11, 11 / view.scale);
      for (const node of nodes) {
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx!.fillStyle = "#4fc3f7";
        ctx!.fill();
        ctx!.strokeStyle = "#0288d1";
        ctx!.lineWidth = 1.5;
        ctx!.stroke();

        // Label
        ctx!.fillStyle = "#e0e0e0";
        ctx!.font = `${fontSize}px sans-serif`;
        ctx!.textAlign = "center";
        ctx!.fillText(node.label, node.x, node.y + nodeRadius + fontSize + 2);
      }

      ctx!.restore();
    };
    draw();

    // ─── Mouse Interactions ──────────────────────────────────────

    // Hit-test: find node at given screen coordinates
    const hitTest = (sx: number, sy: number) => {
      // Convert screen → graph coordinates
      const gx = (sx - view.offsetX) / view.scale;
      const gy = (sy - view.offsetY) / view.scale;
      const hitRadius = Math.max(10, 10 / view.scale);

      for (const node of nodes) {
        const dx = gx - node.x;
        const dy = gy - node.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    };

    // Wheel zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(5, view.scale * delta));

      // Zoom towards mouse position
      const mx = e.offsetX;
      const my = e.offsetY;
      view.offsetX = mx - (mx - view.offsetX) * (newScale / view.scale);
      view.offsetY = my - (my - view.offsetY) * (newScale / view.scale);
      view.scale = newScale;

      draw();
    };

    // Drag to pan
    const handleMouseDown = (e: MouseEvent) => {
      dragStartRef.current = { x: e.offsetX, y: e.offsetY };
      dragStartViewRef.current = { x: view.offsetX, y: view.offsetY };

      // Only drag on background (not on a node)
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) {
        // Click on node — will be handled by handleClick
        return;
      }
      draggingRef.current = true;
      canvas.style.cursor = "grabbing";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) {
        // Update cursor on hover
        const hit = hitTest(e.offsetX, e.offsetY);
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      const dx = e.offsetX - dragStartRef.current.x;
      const dy = e.offsetY - dragStartRef.current.y;
      view.offsetX = dragStartViewRef.current.x + dx;
      view.offsetY = dragStartViewRef.current.y + dy;
      draw();
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      canvas.style.cursor = "grab";
    };

    // Click to navigate
    const handleClick = (e: MouseEvent) => {
      // Ignore if user was dragging
      if (
        Math.abs(e.offsetX - dragStartRef.current.x) > 5 ||
        Math.abs(e.offsetY - dragStartRef.current.y) > 5
      ) {
        return;
      }
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) {
        navigate(`/page/${hit.id}`);
      }
    };

    // Double-click to reset view
    const handleDoubleClick = () => {
      view.offsetX = 0;
      view.offsetY = 0;
      view.scale = 1;
      draw();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("dblclick", handleDoubleClick);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("dblclick", handleDoubleClick);
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
      <h1>🕸️ 知识图谱</h1>
      <p className="graph-page__info">
        {graph.nodes.length} 个节点 · {graph.edges.length} 条连接
      </p>
      <p className="graph-page__hint">
        滚轮缩放 · 拖拽平移 · 双击重置 · 点击节点跳转
      </p>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
