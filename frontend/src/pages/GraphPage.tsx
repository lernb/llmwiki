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

    // Ripple state
    const rippleCenter = { x: 0, y: 0 };
    let rippleActive = false;

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

      // Ripple displacement
      if (rippleActive) {
        for (const node of screenNodes) {
          const dx = node.x - rippleCenter.x;
          const dy = node.y - rippleCenter.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 2) continue;
          const wave = Math.sin(dist * 0.06 - time * 5) * 5 * Math.exp(-dist * 0.008);
          node.x += (dx / dist) * wave;
          node.y += (dy / dist) * wave;
        }
      }

      // Highlight sets — direct edges of the showing (hovered/fading) node
      const hlEdges = new Set<string>();
      if (showingId) {
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
          ctx.strokeStyle = isDark ? "rgba(120,140,170,0.02)" : "rgba(100,120,140,0.035)";
          ctx.lineWidth = 0.3;
        } else if (isHL) {
          const a = 0.3 + tV * 0.7;
          const pulse = 0.8 + 0.2 * Math.sin(time * 4);
          ctx.strokeStyle = isDark ? `hsla(195,45%,55%,${a * pulse})` : `hsla(195,40%,48%,${a * pulse})`;
          ctx.lineWidth = 0.5 + tV * 1.2;
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
        const isDimmed = showingId && !isHovered;

        const ratio = node.edgeCount / node.maxEdge;
        const baseR = Math.max(3, 2 + ratio * 20);
        const pulse = 1 + 0.06 * Math.sin(time * 2 + (homeNodes.find(h => h.id === node.id)?.phaseX ?? 0));
        const scale = isHovered ? 1 + hoverTransition * 0.45 : 1;
        const r = baseR * pulse * scale;

        const hue = 195;

        if (isDimmed) ctx.globalAlpha = 0.08;
        else if (isHovered) ctx.globalAlpha = 0.5 + hoverTransition * 0.5;
        else ctx.globalAlpha = 0.65;

        // Glow — breathing pulse, fades with lerp
        if (isHovered && hoverTransition > 0.01) {
          const p = 0.65 + 0.35 * Math.sin(time * 3);
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 4);
          const ga = 0.4 * hoverTransition * p;
          grad.addColorStop(0, isDark ? `hsla(195,70%,60%,${ga})` : `hsla(195,60%,55%,${ga * 0.7})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        const normalH = isDark ? 30 + ratio * 20 : 35 + ratio * 15;
        const hoverH = isDark ? 72 : 65;
        const fillH = isHovered ? normalH + (hoverH - normalH) * hoverTransition : normalH;
        const normalS = isDark ? 35 + ratio * 20 : 30 + ratio * 15;
        const hoverS = isDark ? 90 : 80;
        const fillS = isHovered ? normalS + (hoverS - normalS) * hoverTransition : normalS;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${fillS}%, ${fillH}%)`;
        ctx.fill();

        // Label — fades in/out
        if (!isDimmed || hoverTransition > 0.15) {
          const labelSize = Math.max(9, 9 + ratio * 5);
          ctx.fillStyle = isHovered
            ? (isDark ? `hsla(195,50%,55%,${0.4 + hoverTransition * 0.6 + 0.1 * Math.sin(time * 3 + 0.5)})` : "hsla(195,45%,50%,0.85)")
            : textColor;
          ctx.font = `${labelSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.x, node.y + r + labelSize + 3);
        }
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

    const mouseenter = () => {
      rippleActive = true;
      rippleCenter.x = (mouse.x - view.offsetX) / view.scale;
      rippleCenter.y = (mouse.y - view.offsetY) / view.scale;
    };

    const mouseleave = () => {
      if (hoveredNodeId) fadeOutNodeId = hoveredNodeId;
      hoveredNodeId = null;
      rippleActive = false;
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
    canvas.addEventListener("mouseenter", mouseenter);
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
      canvas.removeEventListener("mouseenter", mouseenter);
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
