import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type MapNode = {
  id: string;
  name: string;
  type: string;
  area: string;
  status: string;
  path: string;
  url: string;
  description: string;
  parentId: string | null;
  dependsOn: string[];
  order: number;
};

type MapData = {
  source: 'notion' | 'snapshot';
  syncedAt: string;
  error?: string;
  nodes: MapNode[];
};

type Placed = MapNode & { x: number; y: number; z: number; level: number; radius: number };

const STATUS_COLORS: Record<string, string> = {
  Live: '#34d399',
  Bezig: '#60a5fa',
  Gepland: '#fbbf24',
  Idee: '#9ca3af',
  Verouderd: '#f87171',
};

const AREA_COLORS: Record<string, string> = {
  Opdrachtbon: '#38bdf8',
  Backoffice: '#a78bfa',
  Klantpagina: '#f472b6',
  'Pre-press': '#fb923c',
  Imposition: '#facc15',
  Catalogus: '#4ade80',
  Opslag: '#94a3b8',
  Kiosk: '#f87171',
  Hosting: '#d6a77a',
  Algemeen: '#e5e7eb',
};

const statusColor = (status: string) => STATUS_COLORS[status] || '#9ca3af';
const areaColor = (area: string) => AREA_COLORS[area] || '#e5e7eb';

/** Zet de nodes in 3D: de wortel in het midden, kinderen op een bol rond hun ouder. */
function layout(nodes: MapNode[]): Placed[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, MapNode[]>();
  const roots: MapNode[] = [];
  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId) && node.parentId !== node.id) {
      const list = children.get(node.parentId) || [];
      list.push(node);
      children.set(node.parentId, list);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (list: MapNode[]) =>
    list.sort((a, b) => a.area.localeCompare(b.area) || a.order - b.order || a.name.localeCompare(b.name));

  const placed: Placed[] = [];
  const seen = new Set<string>();
  const radii = [0, 250, 95, 55, 40];
  const sizes = [17, 11, 7, 5, 4];
  const golden = Math.PI * (3 - Math.sqrt(5));

  const place = (node: MapNode, x: number, y: number, z: number, level: number, out: Vec) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    placed.push({ ...node, x, y, z, level, radius: sizes[Math.min(level, sizes.length - 1)] });
    const kids = sortNodes(children.get(node.id) || []);
    const r = radii[Math.min(level + 1, radii.length - 1)];
    // Kleinkinderen gaan naar buiten toe, weg van het midden, zodat clusters niet over elkaar vallen.
    const shift = level === 0 ? 0 : r * 0.75;
    const cx = x + out.x * shift;
    const cy = y + out.y * shift;
    const cz = z + out.z * shift;
    kids.forEach((kid, i) => {
      const t = kids.length === 1 ? 0.5 : i / (kids.length - 1);
      const yy = 1 - 2 * (0.04 + 0.92 * t);
      const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
      const theta = i * golden;
      const kx = cx + Math.cos(theta) * ring * r;
      const ky = cy + yy * r * 0.8;
      const kz = cz + Math.sin(theta) * ring * r;
      const dx = kx - x;
      const dy = ky - y;
      const dz = kz - z;
      const len = Math.hypot(dx, dy, dz) || 1;
      place(kid, kx, ky, kz, level + 1, { x: dx / len, y: dy / len, z: dz / len });
    });
  };

  sortNodes(roots).forEach((root, i) => {
    const offset = roots.length > 1 ? (i - (roots.length - 1) / 2) * 420 : 0;
    place(root, offset, 0, 0, 0, { x: 0, y: 0, z: 0 });
  });
  return placed;
}

type Vec = { x: number; y: number; z: number };

export default function ProjectMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<'unknown' | 'denied' | 'ok'>('unknown');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenAreas, setHiddenAreas] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);

  const placed = useMemo(() => (data ? layout(data.nodes) : []), [data]);
  const placedById = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed]);
  const areas = useMemo(() => Array.from(new Set(placed.map((n) => n.area))).sort(), [placed]);

  // Alles wat het tekenen nodig heeft, zonder opnieuw renderen van React.
  const view = useRef({
    yaw: 0.6,
    pitch: -0.35,
    dist: 1250,
    target: { x: 0, y: 0, z: 0 } as Vec,
    goal: { x: 0, y: 0, z: 0 } as Vec,
    hoverId: null as string | null,
    selectedId: null as string | null,
    hiddenAreas: new Set<string>(),
    query: '',
    autoRotate: true,
    placed: [] as Placed[],
    byId: new Map<string, Placed>(),
    projected: [] as { id: string; sx: number; sy: number; r: number; depth: number }[],
  });

  useEffect(() => {
    view.current.placed = placed;
    view.current.byId = placedById;
  }, [placed, placedById]);
  useEffect(() => {
    view.current.selectedId = selectedId;
    const node = selectedId ? placedById.get(selectedId) : null;
    view.current.goal = node ? { x: node.x, y: node.y, z: node.z } : { x: 0, y: 0, z: 0 };
  }, [selectedId, placedById]);
  useEffect(() => {
    view.current.hiddenAreas = new Set(hiddenAreas);
  }, [hiddenAreas]);
  useEffect(() => {
    view.current.query = query.trim().toLowerCase();
  }, [query]);
  useEffect(() => {
    view.current.autoRotate = autoRotate;
  }, [autoRotate]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/map${refresh ? '?refresh=1' : ''}`, { credentials: 'include' });
      if (response.status === 401 || response.status === 403) {
        setAuthState('denied');
        return;
      }
      if (!response.ok) throw new Error(`Server gaf status ${response.status}`);
      setData(await response.json());
      setAuthState('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'FDP Register 3D-map';
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    void load();
  }, [load]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setLoginError(response.status === 401 ? 'Wachtwoord klopt niet.' : 'Inloggen is nu niet mogelijk.');
        return;
      }
      setPassword('');
      await load();
    } catch {
      setLoginError('Geen verbinding met de server.');
    }
  };

  // Tekenen en bediening.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || authState !== 'ok') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = view.current;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const project = (p: Vec) => {
      const dx = p.x - v.target.x;
      const dy = p.y - v.target.y;
      const dz = p.z - v.target.z;
      const cy = Math.cos(v.yaw);
      const sy = Math.sin(v.yaw);
      const x1 = dx * cy + dz * sy;
      const z1 = -dx * sy + dz * cy;
      const cp = Math.cos(v.pitch);
      const sp = Math.sin(v.pitch);
      const y2 = dy * cp - z1 * sp;
      const z2 = dy * sp + z1 * cp;
      const depth = v.dist + z2;
      const f = Math.max(0.05, 900 / Math.max(80, depth));
      const scale = f * (Math.min(width, 1100) / 1000 + 0.35);
      return { sx: width / 2 + x1 * scale, sy: height / 2 + y2 * scale, scale, depth };
    };

    const matches = (n: Placed) => {
      if (!v.query) return true;
      return `${n.name} ${n.path} ${n.area} ${n.type} ${n.status}`.toLowerCase().includes(v.query);
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (v.autoRotate && !dragging) v.yaw += dt * 0.12;
      v.target.x += (v.goal.x - v.target.x) * Math.min(1, dt * 4);
      v.target.y += (v.goal.y - v.target.y) * Math.min(1, dt * 4);
      v.target.z += (v.goal.z - v.target.z) * Math.min(1, dt * 4);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
      bg.addColorStop(0, '#151a2b');
      bg.addColorStop(1, '#07080d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const proj = new Map<string, ReturnType<typeof project>>();
      for (const n of v.placed) proj.set(n.id, project(n));

      const selected = v.selectedId ? v.byId.get(v.selectedId) : null;
      const related = new Set<string>();
      if (selected) {
        related.add(selected.id);
        if (selected.parentId) related.add(selected.parentId);
        selected.dependsOn.forEach((id) => related.add(id));
        for (const n of v.placed) {
          if (n.parentId === selected.id || n.dependsOn.includes(selected.id)) related.add(n.id);
        }
      }
      const visible = (n: Placed) => !v.hiddenAreas.has(n.area);
      const alphaFor = (n: Placed) => {
        let a = 1;
        if (selected && !related.has(n.id)) a = 0.18;
        if (v.query && !matches(n)) a = Math.min(a, 0.12);
        return a;
      };

      // Verbindingen: ouder-kind (vast) en afhankelijkheid (gestreept).
      for (const n of v.placed) {
        if (!visible(n)) continue;
        const a = proj.get(n.id)!;
        const drawLine = (otherId: string, dashed: boolean) => {
          const other = v.byId.get(otherId);
          if (!other || !visible(other)) return;
          const b = proj.get(otherId)!;
          const active = selected && (selected.id === n.id || selected.id === otherId);
          const alpha = Math.min(alphaFor(n), alphaFor(other)) * (active ? 1 : dashed ? 0.35 : 0.5);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.setLineDash(dashed ? [5, 6] : []);
          ctx.lineWidth = active ? 2 : 1;
          ctx.strokeStyle = dashed ? `rgba(251,113,133,${alpha})` : `rgba(148,163,184,${alpha})`;
          ctx.stroke();
          ctx.setLineDash([]);
        };
        if (n.parentId) drawLine(n.parentId, false);
        for (const dep of n.dependsOn) drawLine(dep, true);
      }

      // Nodes, van ver naar dichtbij.
      const order = v.placed.filter(visible).sort((m, n) => proj.get(n.id)!.depth - proj.get(m.id)!.depth);
      v.projected = [];
      for (const n of order) {
        const p = proj.get(n.id)!;
        const r = Math.max(3, n.radius * p.scale);
        const alpha = alphaFor(n);
        const fog = Math.max(0.35, Math.min(1, 1.25 - (p.depth - v.dist + 400) / 1400));
        ctx.globalAlpha = alpha * fog;
        const color = statusColor(n.status);
        const glow = ctx.createRadialGradient(p.sx, p.sy, r * 0.2, p.sx, p.sy, r * 2.6);
        glow.addColorStop(0, `${color}55`);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 2.6, 0, Math.PI * 2);
        ctx.fill();

        const body = ctx.createRadialGradient(p.sx - r * 0.35, p.sy - r * 0.35, r * 0.1, p.sx, p.sy, r);
        body.addColorStop(0, '#ffffff');
        body.addColorStop(0.25, color);
        body.addColorStop(1, '#0b1020');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = n.id === v.selectedId || n.id === v.hoverId ? 3 : 2;
        ctx.strokeStyle = areaColor(n.area);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 2, 0, Math.PI * 2);
        ctx.stroke();

        const showLabel = n.level <= 1 || n.id === v.hoverId || n.id === v.selectedId || related.has(n.id) || (v.query && matches(n)) || p.scale > 1.15;
        if (showLabel) {
          ctx.font = `${n.level === 0 ? 700 : 500} ${Math.round(Math.max(10, Math.min(15, 9 + p.scale * 3)))}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e5e7eb';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
          ctx.fillText(n.name.length > 32 ? `${n.name.slice(0, 31)}…` : n.name, p.sx, p.sy + r + 16);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        v.projected.push({ id: n.id, sx: p.sx, sy: p.sy, r: r + 6, depth: p.depth });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // Bediening: slepen = draaien, scrollen/knijpen = zoomen, klikken = kiezen.
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let pinchDist = 0;

    const hit = (x: number, y: number) => {
      let best: string | null = null;
      let bestDepth = Infinity;
      for (const p of v.projected) {
        if ((p.sx - x) ** 2 + (p.sy - y) ** 2 <= p.r ** 2 && p.depth < bestDepth) {
          best = p.id;
          bestDepth = p.depth;
        }
      }
      return best;
    };
    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const pt = local(event);
      pointers.set(event.pointerId, pt);
      if (pointers.size === 1) {
        dragging = true;
        moved = 0;
        lastX = pt.x;
        lastY = pt.y;
      } else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchDist = v.dist;
      }
    };
    const onMove = (event: PointerEvent) => {
      const pt = local(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, pt);
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0) v.dist = Math.max(350, Math.min(3200, pinchDist * (pinchStart / Math.max(20, d))));
        moved += 10;
        return;
      }
      if (dragging) {
        const dx = pt.x - lastX;
        const dy = pt.y - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        v.yaw += dx * 0.006;
        v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + dy * 0.006));
        lastX = pt.x;
        lastY = pt.y;
      } else {
        const id = hit(pt.x, pt.y);
        v.hoverId = id;
        canvas.style.cursor = id ? 'pointer' : 'grab';
      }
    };
    const onUp = (event: PointerEvent) => {
      const pt = local(event);
      pointers.delete(event.pointerId);
      if (pointers.size === 0) {
        if (dragging && moved < 6) {
          setSelectedId(hit(pt.x, pt.y));
        }
        dragging = false;
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      v.dist = Math.max(350, Math.min(3200, v.dist * (1 + event.deltaY * 0.001)));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [authState]);

  const selected = selectedId ? placedById.get(selectedId) || null : null;
  const parent = selected?.parentId ? placedById.get(selected.parentId) : null;
  const children = selected ? placed.filter((n) => n.parentId === selected.id) : [];
  const dependsOn = selected ? selected.dependsOn.map((id) => placedById.get(id)).filter(Boolean) as Placed[] : [];
  const neededBy = selected ? placed.filter((n) => n.dependsOn.includes(selected.id)) : [];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of placed) counts[n.status] = (counts[n.status] || 0) + 1;
    return counts;
  }, [placed]);

  const zoom = (factor: number) => {
    view.current.dist = Math.max(350, Math.min(3200, view.current.dist * factor));
  };
  const resetView = () => {
    const v = view.current;
    v.yaw = 0.6;
    v.pitch = -0.35;
    v.dist = 1250;
    setSelectedId(null);
  };

  const chip = (node: Placed) => (
    <button
      key={node.id}
      type="button"
      onClick={() => setSelectedId(node.id)}
      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/15"
    >
      {node.name}
    </button>
  );

  if (authState === 'unknown' && loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#07080d] text-slate-300">Map laden…</div>;
  }

  if (authState === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080d] p-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-100">
          <div>
            <h1 className="text-lg font-bold">FDP Register 3D-map</h1>
            <p className="mt-1 text-sm text-slate-400">Alleen voor beheer. Log in met het backoffice-wachtwoord.</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wachtwoord"
            autoFocus
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          {loginError && <p className="text-sm text-red-400">{loginError}</p>}
          <button type="submit" className="w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400">
            Inloggen
          </button>
        </form>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#07080d] p-6 text-slate-200">
        <p>De map kon niet worden geladen: {error}</p>
        <button type="button" onClick={() => void load()} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#07080d] text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight">FDP Register · 3D-map</h1>
          <p className="text-xs text-slate-400">
            {data?.source === 'notion' ? 'Live uit Notion' : 'Ingebouwde snapshot'} · {placed.length} onderdelen
            {data?.source === 'snapshot' && data.syncedAt ? ` · stand ${data.syncedAt}` : ''}
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek onderdeel, pad of gebied…"
          className="min-w-[10rem] flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-sky-400 sm:max-w-xs"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setAutoRotate((x) => !x)} className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10">
            {autoRotate ? 'Stop draaien' : 'Draai'}
          </button>
          <button type="button" onClick={() => zoom(0.8)} className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10" aria-label="Inzoomen">＋</button>
          <button type="button" onClick={() => zoom(1.25)} className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10" aria-label="Uitzoomen">－</button>
          <button type="button" onClick={resetView} className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10">Reset</button>
          <button type="button" onClick={() => void load(true)} className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10">
            {loading ? 'Vernieuwen…' : 'Vernieuwen'}
          </button>
          <a href="/" className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10">Naar de app</a>
        </div>
      </header>

      {data?.error && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">{data.error}</div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={wrapRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block touch-none" />
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[14rem] space-y-3 rounded-xl border border-white/10 bg-black/55 p-3 text-xs backdrop-blur">
          <div>
            <div className="mb-1 font-semibold text-slate-300">Status</div>
            {Object.keys(STATUS_COLORS).map((status) => (
              <div key={status} className="flex items-center gap-2 text-slate-300">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                {status} <span className="text-slate-500">{statusCounts[status] || 0}</span>
              </div>
            ))}
          </div>
          <div className="text-slate-400">
            <span className="inline-block w-5 border-t border-slate-400 align-middle" /> hoort bij
            <br />
            <span className="inline-block w-5 border-t border-dashed border-rose-400 align-middle" /> hangt af van
          </div>
        </div>

        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 sm:max-w-[60%]">
          {areas.map((area) => {
            const hidden = hiddenAreas.includes(area);
            return (
              <button
                key={area}
                type="button"
                onClick={() => setHiddenAreas((list) => (list.includes(area) ? list.filter((a) => a !== area) : [...list, area]))}
                className={`rounded-full border px-2.5 py-1 text-xs backdrop-blur transition ${hidden ? 'border-white/10 bg-black/40 text-slate-500 line-through' : 'border-white/25 bg-black/50 text-slate-100'}`}
                style={hidden ? undefined : { boxShadow: `inset 0 0 0 1px ${areaColor(area)}` }}
              >
                {area}
              </button>
            );
          })}
        </div>

        {selected && (
          <aside className="absolute bottom-3 right-3 top-auto max-h-[70%] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1020]/95 p-4 shadow-2xl backdrop-blur sm:top-3 sm:max-h-none">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{selected.type || 'Onderdeel'} · {selected.area}</div>
                <h2 className="text-base font-bold leading-snug">{selected.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-md px-2 py-1 text-slate-400 hover:bg-white/10" aria-label="Sluiten">✕</button>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: statusColor(selected.status) }} />
              {selected.status}
            </div>
            {selected.description && <p className="mt-3 text-sm leading-relaxed text-slate-300">{selected.description}</p>}
            {selected.path && (
              <div className="mt-3 text-xs">
                <div className="text-slate-500">Waar het staat</div>
                <code className="break-all text-sky-300">{selected.path}</code>
              </div>
            )}
            {selected.url && (
              <a href={selected.url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400">
                Openen ↗
              </a>
            )}
            {parent && (
              <div className="mt-4">
                <div className="mb-1 text-xs text-slate-500">Hoort bij</div>
                <div className="flex flex-wrap gap-1.5">{chip(parent)}</div>
              </div>
            )}
            {children.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs text-slate-500">Onderdelen ({children.length})</div>
                <div className="flex flex-wrap gap-1.5">{children.map(chip)}</div>
              </div>
            )}
            {dependsOn.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs text-slate-500">Hangt af van</div>
                <div className="flex flex-wrap gap-1.5">{dependsOn.map(chip)}</div>
              </div>
            )}
            {neededBy.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs text-slate-500">Nodig voor</div>
                <div className="flex flex-wrap gap-1.5">{neededBy.map(chip)}</div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
