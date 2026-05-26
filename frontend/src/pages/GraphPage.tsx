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

  // Main rendering
  useEffect(() => {
    if (!graph || !canvasRef.current || graph.nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resizeCanvas = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { W, H };
    };

    let { W, H } = resizeCanvas();

    // Edge counts for sizing
    const edgeCount = new Map<string, number>();
    for (const n of graph.nodes) edgeCount.set(n.id, 0);
    for (const e of graph.edges) {
      edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
      edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
    }
    const maxEdges = Math.max(...Array.from(edgeCount.values()), 1);

    // Adjacency map for highlighting connected nodes
    const adjacency = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
      if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
      adjacency.get(e.source)!.add(e.target);
      adjacency.get(e.target)!.add(e.source);
    }

    // ─── Vogel spiral layout (evenly fills the circle) ──────────────
    const cx = W / 2, cy = H / 2;
    const layoutRadius = Math.min(W, H) * 0.40;

    const homeNodes = graph.nodes.map((n, i) => {
      const idx = i + 1;
      const r = layoutRadius * Math.sqrt(idx / graph.nodes.length);
      const theta = idx * 2.39996;
      return {
        id: n.id, label: n.label,
        homeX: cx + r * Math.cos(theta),
        homeY: cy + r * Math.sin(theta),
        edgeCount: edgeCount.get(n.id) || 0,
        maxEdge: maxEdges,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        freqX: 0.4 + Math.random() * 0.6,
        freqY: 0.3 + Math.random() * 0.7,
      };
    });

    // ─── Animation state ──────────────────────────────────────────
    let animFrameId: number;
    let time = 0;
    let hoverTransition = 0;
    let fadeOutNodeId: string | null = null;
    const FLOAT_AMP = 3;
    const mouse = { x: -1e5, y: -1e5 };
    let hoveredNodeId: string | null = null;
    let screenNodes: Array<any> = [];
    const view = viewRef.current;

    // ─── Draw ─────────────────────────────────────────────────────
    const draw = () => {
      time += 0.016;

      // Hover lerp transition with proper fade-out
      const showingId = hoveredNodeId || fadeOutNodeId;
      const targetT = hoveredNodeId ? 1 : 0;
      hoverTransition += (targetT - hoverTransition) * 0.18;
      if (hoverTransition < 0.01 && fadeOutNodeId) fadeOutNodeId = null;

      // Floating offset from home positions
      screenNodes = homeNodes.map(n => ({
        id: n.id, label: n.label,
        x: n.homeX + FLOAT_AMP * Math.sin(time * n.freqX + n.phaseX),
        y: n.homeY + FLOAT_AMP * Math.sin(time * n.freqY + n.phaseY),
        edgeCount: n.edgeCount, maxEdge: n.maxEdge,
      }));

      // Highlight sets — direct edges + connected nodes of the showing node
      const hlNodes = new Set<string>();
      const hlEdges = new Set<string>();
      if (showingId) {
        hlNodes.add(showingId);
        const conn = adjacency.get(showingId);
        if (conn) for (const nid of conn) hlNodes.add(nid);
        for (const e of graph.edges) {
          if (e.source === showingId || e.target === showingId)
            hlEdges.add(`${e.source}|${e.target}`);
        }
      }

      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      const textColor = cssVar("--text-primary");

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);

      // ─── Draw edges ──────────────────────────────────────────
      for (const edge of graph.edges) {
        const s = screenNodes.find(n => n.id === edge.source);
        const t = screenNodes.find(n => n.id === edge.target);
        if (!s || !t) continue;

        const isHL = hlEdges.has(`${edge.source}|${edge.target}`) || hlEdges.has(`${edge.target}|${edge.source}`);

        const tV = hoverTransition;
        if (showingId && !isHL) {
          const dimA = Math.max(0.02, 0.12 - tV * 0.1);
          ctx.strokeStyle = isDark ? `rgba(120,140,170,${dimA})` : `rgba(100,120,140,${dimA})`;
          ctx.lineWidth = Math.max(0.3, 0.4 - tV * 0.1);
        } else if (isHL) {
          const a = Math.min(0.35, 0.12 + tV * 0.23);
          const pulse = 0.9 + 0.1 * Math.sin(time * 4);
          ctx.strokeStyle = isDark ? `rgba(210,220,230,${a * pulse})` : `rgba(80,100,130,${a * pulse})`;
          ctx.lineWidth = 0.4 + tV * 0.7;
        } else {
          ctx.strokeStyle = isDark ? "rgba(136,153,187,0.12)" : "rgba(102,119,136,0.13)";
          ctx.lineWidth = 0.4;
        }
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      // ─── Draw nodes ──────────────────────────────────────────
      for (const node of screenNodes) {
        const isHovered = node.id === showingId;
        const isConnected = hlNodes.has(node.id) && !isHovered;
        const isDimmed = showingId && !isHovered && !isConnected;

        const ratio = node.edgeCount / node.maxEdge;
        const baseR = Math.max(3, 2 + ratio * 20);
        const pulse = 1 + 0.06 * Math.sin(time * 2 + (homeNodes.find(h => h.id === node.id)?.phaseX ?? 0));
        const scale = isHovered ? 1 + hoverTransition * 0.45 : 1;
        const r = baseR * pulse * scale;

        const hue = 195;

        if (isDimmed) ctx.globalAlpha = 0.65 - hoverTransition * 0.57;
        else if (isHovered) ctx.globalAlpha = 0.65 + hoverTransition * 0.35;
        else if (isConnected) ctx.globalAlpha = 0.65 + hoverTransition * 0.2;
        else ctx.globalAlpha = 0.65;

        // White glow on hovered node only
        if (isHovered && hoverTransition > 0.01) {
          const p = 0.65 + 0.35 * Math.sin(time * 3);
          const glowR = r * 2.5;
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
          const ga = 0.25 * hoverTransition * p;
          grad.addColorStop(0, isDark ? `rgba(210,220,230,${ga})` : `rgba(100,120,150,${ga * 0.6})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        const normalH = isDark ? 30 + ratio * 20 : 35 + ratio * 15;
        const hoverH = isDark ? 72 : 65;
        const connH = isDark ? 52 : 52;
        const fillH = isHovered ? normalH + (hoverH - normalH) * hoverTransition
          : isConnected ? normalH + (connH - normalH) * hoverTransition
          : normalH;
        const normalS = isDark ? 35 + ratio * 20 : 30 + ratio * 15;
        const hoverS = isDark ? 90 : 80;
        const connS = isDark ? 50 : 45;
        const fillS = isHovered ? normalS + (hoverS - normalS) * hoverTransition
          : isConnected ? normalS + (connS - normalS) * hoverTransition
          : normalS;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${fillS}%, ${fillH}%)`;
        ctx.fill();

        // Label — always render; dimmed nodes are already at low globalAlpha
        const labelSize = Math.max(9, 9 + ratio * 5);
        ctx.fillStyle = isHovered
          ? (isDark ? `rgba(230,235,240,${0.5 + hoverTransition * 0.5 + 0.08 * Math.sin(time * 3 + 0.5)})` : "rgba(60,70,90,0.85)")
          : textColor;
        ctx.font = `${labelSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + r + labelSize + 3);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };

    // ─── Animation loop ─────────────────────────────────────────
    const animate = () => {
      draw();
      animFrameId = requestAnimationFrame(animate);
    };
    animate();
    drawRef.current = draw;

    // ─── Theme Change Observer ──────────────────────────────────
    const observer = new MutationObserver(() => {
      if (drawRef.current) drawRef.current();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // ─── Hit test (screen-space) ────────────────────────────────
    const hitTest = (sx: number, sy: number) => {
      const gx = (sx - view.offsetX) / view.scale;
      const gy = (sy - view.offsetY) / view.scale;
      for (let i = screenNodes.length - 1; i >= 0; i--) {
        const n = screenNodes[i];
        const dx = gx - n.x, dy = gy - n.y;
        const r = Math.max(6, (2 + (n.edgeCount / n.maxEdge) * 20) * 1.5);
        if (dx * dx + dy * dy < r * r) return n;
      }
      return null;
    };

    // ─── Events ─────────────────────────────────────────────────
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.max(0.2, Math.min(5, view.scale * delta));
      view.offsetX = e.offsetX - (e.offsetX - view.offsetX) * (ns / view.scale);
      view.offsetY = e.offsetY - (e.offsetY - view.offsetY) * (ns / view.scale);
      view.scale = ns;
    };

    const mousedown = (e: MouseEvent) => {
      dragStartRef.current = { x: e.offsetX, y: e.offsetY };
      dragStartViewRef.current = { x: view.offsetX, y: view.offsetY };
      if (hitTest(e.offsetX, e.offsetY)) return;
      draggingRef.current = true;
      canvas.style.cursor = "grabbing";
    };

    const mousemove = (e: MouseEvent) => {
      mouse.x = e.offsetX;
      mouse.y = e.offsetY;
      if (!draggingRef.current) {
        const hit = hitTest(e.offsetX, e.offsetY);
        if (hoveredNodeId && !hit) fadeOutNodeId = hoveredNodeId;
        hoveredNodeId = hit ? hit.id : null;
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      view.offsetX = dragStartViewRef.current.x + e.offsetX - dragStartRef.current.x;
      view.offsetY = dragStartViewRef.current.y + e.offsetY - dragStartRef.current.y;
    };

    const mouseleave = () => {
      if (hoveredNodeId) fadeOutNodeId = hoveredNodeId;
      hoveredNodeId = null;
      mouse.x = -1e5;
      mouse.y = -1e5;
    };

    const mouseup = () => { draggingRef.current = false; canvas.style.cursor = "grab"; };

    const click = (e: MouseEvent) => {
      if (Math.abs(e.offsetX - dragStartRef.current.x) > 5 || Math.abs(e.offsetY - dragStartRef.current.y) > 5) return;
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) navigate(`/page/${hit.id}`);
    };

    const dblclick = () => { view.offsetX = 0; view.offsetY = 0; view.scale = 1; };

    const resize = () => {
      const s = resizeCanvas();
      W = s.W; H = s.H;
    };

    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("mousedown", mousedown);
    canvas.addEventListener("mousemove", mousemove);
    canvas.addEventListener("mouseleave", mouseleave);
    canvas.addEventListener("mouseup", mouseup);
    canvas.addEventListener("click", click);
    canvas.addEventListener("dblclick", dblclick);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animFrameId);
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("mousedown", mousedown);
      canvas.removeEventListener("mousemove", mousemove);
      canvas.removeEventListener("mouseleave", mouseleave);
      canvas.removeEventListener("mouseup", mouseup);
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
          <span className="graph-page__hint">          滚轮缩放 · 拖拽平移 · 双击重置 · 点击跳转 · 悬停高亮</span>
        </p>
      </div>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
