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
    const focalLength = 500;

    // Edge counts for sizing
    const edgeCount = new Map<string, number>();
    for (const n of graph.nodes) edgeCount.set(n.id, 0);
    for (const e of graph.edges) {
      edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
      edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
    }
    const maxEdges = Math.max(...Array.from(edgeCount.values()), 1);

    // Adjacency map for highlight
    const adjacency = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
      if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
      adjacency.get(e.source)!.add(e.target);
      adjacency.get(e.target)!.add(e.source);
    }

    // 3D Fibonacci sphere positions (computed once)
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const sphereNodes = graph.nodes.map((n, i) => {
      const count = graph.nodes.length;
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      return {
        id: n.id,
        label: n.label,
        phi,
        theta0: theta,
        edgeCount: edgeCount.get(n.id) || 0,
        maxEdge: maxEdges,
      };
    });

    // Animation state
    let animFrameId: number;
    let rotation = 0;
    let time = 0;

    // Mouse tracking
    const mouse = { x: -1e5, y: -1e5 };
    let hoveredNodeId: string | null = null;
    let projectedNodes: Array<any> = [];

    const view = viewRef.current;

    const draw = () => {
      const centerX = W / 2;
      const centerY = H / 2;
      const sphereRadius = Math.min(W, H) * 0.38;

      time += 0.016;

      // Project 3D → 2D with perspective
      projectedNodes = sphereNodes.map((n) => {
        const theta = n.theta0 + rotation;
        const x3d = sphereRadius * Math.sin(n.phi) * Math.cos(theta);
        const y3d = sphereRadius * Math.cos(n.phi);
        const z3d = sphereRadius * Math.sin(n.phi) * Math.sin(theta);
        const p = focalLength / (focalLength + z3d);
        return {
          id: n.id,
          label: n.label,
          screenX: centerX + x3d * p,
          screenY: centerY + y3d * p,
          scale: p, z: z3d,
          edgeCount: n.edgeCount,
          maxEdge: n.maxEdge,
          theta0: n.theta0,
        };
      });

      // Z-sort for depth rendering (far → near)
      projectedNodes.sort((a, b) => a.z - b.z);

      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      const textColor = cssVar("--text-primary");

      // Highlight set
      const hlNodes = new Set<string>();
      const hlEdges = new Set<string>();
      if (hoveredNodeId) {
        hlNodes.add(hoveredNodeId);
        const connected = adjacency.get(hoveredNodeId);
        if (connected) {
          for (const nid of connected) hlNodes.add(nid);
        }
        for (const e of graph.edges) {
          if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
            hlEdges.add(`${e.source}|${e.target}`);
          }
        }
      }

      // Cursor proximity push
      const mgx = (mouse.x - view.offsetX) / view.scale;
      const mgy = (mouse.y - view.offsetY) / view.scale;
      const pushR = 60;
      for (const node of projectedNodes) {
        const dx = node.screenX - mgx;
        const dy = node.screenY - mgy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < pushR && dist > 0.1) {
          const force = ((pushR - dist) / pushR) * 5;
          node.screenX += (dx / dist) * force;
          node.screenY += (dy / dist) * force;
        }
      }

      // ─── Draw edges ──────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);

      for (const edge of graph.edges) {
        const s = projectedNodes.find((n) => n.id === edge.source);
        const t = projectedNodes.find((n) => n.id === edge.target);
        if (!s || !t) continue;

        const isHL = hlEdges.has(`${edge.source}|${edge.target}`) || hlEdges.has(`${edge.target}|${edge.source}`);

        if (hoveredNodeId && !isHL) {
          const dim = Math.max(0, (s.z + sphereRadius) / (2 * sphereRadius));
          ctx.strokeStyle = isDark ? `rgba(100,120,140,${dim * 0.06})` : `rgba(80,100,120,${dim * 0.06})`;
          ctx.lineWidth = 0.3;
        } else if (isHL) {
          ctx.strokeStyle = isDark ? "#4fc3f7" : "#0288d1";
          ctx.lineWidth = 2;
        } else {
          const depth = ((s.z + t.z) / 2 + sphereRadius) / (2 * sphereRadius);
          const alpha = Math.max(0.1, 0.4 + 0.4 * depth);
          ctx.strokeStyle = isDark ? `rgba(136,153,187,${alpha * 0.5})` : `rgba(102,119,136,${alpha * 0.4})`;
          ctx.lineWidth = Math.max(0.4, 0.8 * (s.scale + t.scale) / 2);
        }
        ctx.beginPath();
        ctx.moveTo(s.screenX, s.screenY);
        ctx.lineTo(t.screenX, t.screenY);
        ctx.stroke();
      }

      // ─── Draw nodes ──────────────────────────────────────────
      for (const node of projectedNodes) {
        const isHovered = node.id === hoveredNodeId;
        const isConnected = hlNodes.has(node.id) && !isHovered;
        const isDimmed = hoveredNodeId && !isHovered && !isConnected;

        const ratio = node.edgeCount / node.maxEdge;
        const baseR = Math.max(3, 2 + ratio * 20);
        const pulse = 1 + 0.08 * Math.sin(time * 2 + node.theta0);

        let r: number;
        if (isHovered) r = baseR * 2.2 * pulse;
        else if (isConnected) r = baseR * 1.4 * pulse;
        else r = baseR * pulse * node.scale;

        let hue: number;
        if (ratio < 0.15) hue = 40;
        else if (ratio < 0.4) hue = 140;
        else if (ratio < 0.7) hue = 190;
        else hue = 220;

        if (isDimmed) ctx.globalAlpha = 0.15;
        else if (isHovered) ctx.globalAlpha = 1;
        else ctx.globalAlpha = 0.6 + 0.4 * node.scale;

        // Glow for hovered node
        if (isHovered) {
          const grad = ctx.createRadialGradient(node.screenX, node.screenY, 0, node.screenX, node.screenY, r * 4);
          grad.addColorStop(0, isDark ? "rgba(79,195,247,0.25)" : "rgba(2,136,209,0.2)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        const fillH = isHovered ? (isDark ? 65 : 55) : 35 + ratio * (isDark ? 25 : 5);
        const fillS = isDark ? 50 + ratio * 30 : 45 + ratio * 20;
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${fillS}%, ${fillH}%)`;
        ctx.fill();
        ctx.strokeStyle = isHovered ? (isDark ? "#4fc3f7" : "#0288d1") : (isDark ? "#667788" : "#445566");
        ctx.lineWidth = isHovered ? 2.5 : Math.max(0.5, 1 * node.scale);
        ctx.stroke();

        // Label
        if (!isDimmed || isHovered) {
          const labelSize = Math.max(9, 9 + ratio * 5) * (isHovered ? 1.3 : node.scale);
          ctx.fillStyle = isHovered ? (isDark ? "#4fc3f7" : "#01579b") : textColor;
          ctx.font = `${labelSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.screenX, node.screenY + r + labelSize + 3);
        }

        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };

    // ─── Animation loop ─────────────────────────────────────────
    const animate = () => {
      rotation += 0.002;
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
      for (let i = projectedNodes.length - 1; i >= 0; i--) {
        const n = projectedNodes[i];
        const dx = gx - n.screenX, dy = gy - n.screenY;
        const hitR = Math.max(6, (2 + (n.edgeCount / n.maxEdge) * 20) * 1.5);
        if (dx * dx + dy * dy < hitR * hitR) return n;
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
        hoveredNodeId = hit ? hit.id : null;
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      view.offsetX = dragStartViewRef.current.x + e.offsetX - dragStartRef.current.x;
      view.offsetY = dragStartViewRef.current.y + e.offsetY - dragStartRef.current.y;
    };

    const mouseup = () => { draggingRef.current = false; canvas.style.cursor = "grab"; };

    const mouseleave = () => {
      hoveredNodeId = null;
      mouse.x = -1e5;
      mouse.y = -1e5;
    };

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
    canvas.addEventListener("mouseup", mouseup);
    canvas.addEventListener("mouseleave", mouseleave);
    canvas.addEventListener("click", click);
    canvas.addEventListener("dblclick", dblclick);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animFrameId);
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("mousedown", mousedown);
      canvas.removeEventListener("mousemove", mousemove);
      canvas.removeEventListener("mouseup", mouseup);
      canvas.removeEventListener("mouseleave", mouseleave);
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
