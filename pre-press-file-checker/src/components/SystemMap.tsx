import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYERS, NODES, TASKS, TASK_STATUSES, type MapNodeInfo, type MapTask, type NodeStatus, type Priority, type TaskSource, type TaskStatus, type WireKind } from '../data/mapModel';

type SavedState = { statuses: Record<string, TaskStatus>; custom: MapTask[] };

const STATUS_STYLE: Record<NodeStatus, string> = {
  Live: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Te testen na deploy': 'bg-amber-100 text-amber-800 border-amber-200',
  Gepland: 'bg-sky-100 text-sky-800 border-sky-200',
};
const PRIORITY_STYLE: Record<Priority, string> = {
  Hoog: 'bg-rose-100 text-rose-800 border-rose-200',
  Middel: 'bg-amber-100 text-amber-800 border-amber-200',
  Laag: 'bg-slate-100 text-slate-700 border-slate-200',
};
const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  Idee: 'bg-violet-50 text-violet-800 border-violet-200',
  'Te doen': 'bg-white text-slate-800 border-slate-300',
  Bezig: 'bg-sky-50 text-sky-800 border-sky-200',
  Klaar: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Niet doen': 'bg-slate-100 text-slate-500 border-slate-200',
};
const SOURCES: TaskSource[] = ['Juridisch en privacy', 'Beveiliging', 'Website-analyse', 'Testen na deploy', 'Toekomst', 'Suggestie', 'Eigen idee'];
const isOpen = (status: TaskStatus) => status === 'Te doen' || status === 'Bezig';

/* ------------------------- Schematische afbeeldingen ------------------------- */

function Wireframe({ kind }: { kind: WireKind }) {
  if (!kind) return null;
  const line = '#cbd5e1';
  const ink = '#475569';
  const red = '#e31c24';
  const box = (x: number, y: number, w: number, h: number, fill = '#fff', stroke = line) => <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} stroke={stroke} />;
  const bar = (x: number, y: number, w: number, fill = '#e2e8f0') => <rect x={x} y={y} width={w} height={5} rx={2.5} fill={fill} />;
  const btn = (x: number, y: number, w: number, fill = red) => <rect x={x} y={y} width={w} height={12} rx={6} fill={fill} />;
  let body: React.ReactNode = null;
  switch (kind) {
    case 'login':
      body = <>{box(70, 18, 100, 112)}{bar(88, 30, 64, ink)}{box(82, 48, 76, 14)}{box(82, 68, 76, 14)}{box(82, 88, 76, 14)}{btn(82, 108, 76)}</>;
      break;
    case 'overzicht':
      body = <>{box(8, 8, 70, 30)}{box(85, 8, 70, 30)}{box(162, 8, 70, 30)}{box(8, 46, 150, 96)}{[0, 1, 2, 3, 4].map((i) => <g key={i}>{bar(16, 58 + i * 16, 50, '#94a3b8')}{bar(80, 58 + i * 16, 20)}{bar(110, 58 + i * 16, 20)}{bar(138, 58 + i * 16, 12)}</g>)}{box(166, 46, 66, 96)}{bar(172, 56, 40, ink)}{bar(172, 70, 52)}{bar(172, 82, 44)}</>;
      break;
    case 'opdrachten':
      body = <>{[0, 1, 2].map((i) => <g key={i}>{box(10, 8 + i * 46, 220, 40)}{bar(18, 16 + i * 46, 60, ink)}{bar(18, 28 + i * 46, 110)}{btn(18, 36 + i * 46 - 2, 50, '#0f172a')}<rect x={176} y={14 + i * 46} width={46} height={12} rx={6} fill={i === 0 ? '#34d399' : '#fbbf24'} />{bar(140, 32 + i * 46, 80, '#bfdbfe')}</g>)}</>;
      break;
    case 'bon':
      body = <>{box(30, 6, 180, 138)}{bar(40, 14, 40, ink)}{bar(150, 14, 50)}{box(40, 30, 160, 12)}{box(40, 48, 20, 12)}{box(64, 48, 90, 12)}{box(160, 48, 40, 12)}{bar(40, 70, 60, '#94a3b8')}{box(40, 78, 36, 12)}{box(80, 78, 36, 12)}{btn(122, 78, 78, '#0f172a')}{btn(40, 100, 60)}{bar(140, 106, 60, ink)}{bar(140, 118, 60)}</>;
      break;
    case 'klant':
      body = <>{box(60, 6, 120, 138)}{bar(76, 16, 60, ink)}{[0, 1, 2, 3].map((i) => <g key={i}><circle cx={82} cy={42 + i * 20} r={5} fill={i < 2 ? '#34d399' : '#e2e8f0'} />{bar(94, 40 + i * 20, 70, i < 2 ? '#94a3b8' : '#e2e8f0')}</g>)}{btn(76, 118, 88)}</>;
      break;
    case 'upload':
      body = <>{box(70, 6, 100, 138)}{bar(86, 16, 68, ink)}{box(84, 34, 72, 56, '#f8fafc')}<path d="M120 76 V50 M110 60 L120 50 L130 60" stroke={red} strokeWidth="3" fill="none" strokeLinecap="round" />{btn(84, 104, 72)}</>;
      break;
    case 'prepress':
      body = <>{box(8, 8, 170, 134, '#e2e8f0')}{box(60, 16, 66, 118, '#fff', '#64748b')}<rect x={64} y={20} width={58} height={110} fill="none" stroke={red} strokeDasharray="3 2" />{box(184, 8, 48, 134)}{btn(190, 18, 36, '#0f172a')}{btn(190, 36, 36, '#94a3b8')}{btn(190, 120, 36)}</>;
      break;
    case 'imposition':
      body = <>{box(30, 10, 180, 130, '#fff', '#64748b')}{[0, 1, 2, 3].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={46 + c * 84} y={22 + r * 28} width={72} height={22} rx={1} fill="#bfdbfe" stroke="#60a5fa" />))}</>;
      break;
    case 'bestanden':
      body = <>{box(10, 8, 220, 134)}{box(20, 18, 24, 24, '#e2e8f0')}{bar(52, 22, 80, ink)}{bar(52, 34, 50)}{box(20, 54, 200, 20, '#ecfdf5', '#a7f3d0')}{btn(20, 86, 62, '#0f172a')}{btn(88, 86, 62)}{btn(156, 86, 64, '#94a3b8')}</>;
      break;
    case 'personeel':
      body = <>{box(10, 8, 220, 134)}{[0, 1, 2, 3].map((i) => <g key={i}>{bar(20, 20 + i * 26, 50, ink)}{bar(90, 20 + i * 26, 40)}{[0, 1, 2].map((c) => <rect key={c} x={150 + c * 22} y={18 + i * 26} width={14} height={14} rx={3} fill={(i + c) % 2 ? '#34d399' : '#e2e8f0'} />)}</g>)}</>;
      break;
    case 'kiosk':
      body = <>{box(20, 10, 200, 100)}{bar(34, 24, 60, ink)}{btn(34, 50, 70)}{btn(114, 50, 70, '#0f172a')}{box(90, 118, 60, 20, '#e2e8f0')}</>;
      break;
  }
  return (
    <svg viewBox="0 0 240 150" role="img" aria-label="Schematische weergave van het scherm" className="w-full rounded-lg border border-slate-200 bg-slate-50">{body}</svg>
  );
}

/* ------------------------------- Pagina ------------------------------- */

export default function SystemMap() {
  const [auth, setAuth] = useState<'unknown' | 'denied' | 'ok'>('unknown');
  const [state, setState] = useState<SavedState>({ statuses: {}, custom: [] });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<'kaart' | 'taken'>('kaart');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fSource, setFSource] = useState<TaskSource | ''>('');
  const [fStatus, setFStatus] = useState<TaskStatus | 'open'>('open');
  const [fPriority, setFPriority] = useState<Priority | ''>('');
  const [ideaOpen, setIdeaOpen] = useState(false);
  const loaded = useRef(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/map/state', { credentials: 'include' });
      if (response.status === 401 || response.status === 403) { setAuth('denied'); return; }
      if (!response.ok) throw new Error(`Server gaf status ${response.status}`);
      const data = await response.json();
      setState({ statuses: data.statuses || {}, custom: Array.isArray(data.custom) ? data.custom : [] });
      setAuth('ok');
      loaded.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Onbekende fout');
    }
  }, []);

  useEffect(() => {
    document.title = 'FDP overzichtskaart';
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow';
    void load();
  }, [load]);

  const persist = useCallback((next: SavedState) => {
    setState(next);
    if (!loaded.current) return;
    setSaved('saving');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/map/state', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        setSaved(response.ok ? 'saved' : 'error');
      } catch { setSaved('error'); }
    }, 500);
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) { setLoginError(response.status === 401 ? 'Wachtwoord klopt niet.' : 'Inloggen is nu niet mogelijk.'); return; }
      setPassword('');
      await load();
    } catch { setLoginError('Geen verbinding met de server.'); }
  };

  const tasks: MapTask[] = useMemo(
    () => [...TASKS.map((task) => ({ ...task, status: (state.statuses[task.id] as TaskStatus) || task.status })), ...state.custom.map((task) => ({ ...task, status: (state.statuses[task.id] as TaskStatus) || task.status }))],
    [state],
  );
  const nodeById = useMemo(() => new Map(NODES.map((node) => [node.id, node])), []);
  const setStatus = (id: string, status: TaskStatus) => persist({ ...state, statuses: { ...state.statuses, [id]: status } });
  const addIdea = (idea: { title: string; what: string; nodeId: string; priority: Priority }) => {
    const task: MapTask = { id: `c${Date.now().toString(36)}`, nodeId: idea.nodeId, title: idea.title, what: idea.what, source: 'Eigen idee', priority: idea.priority, effort: 'Quick win', status: 'Idee', custom: true, createdAt: new Date().toISOString() };
    persist({ ...state, custom: [...state.custom, task] });
  };
  const removeIdea = (id: string) => {
    const statuses = { ...state.statuses };
    delete statuses[id];
    persist({ statuses, custom: state.custom.filter((task) => task.id !== id) });
  };

  const openByNode = useMemo(() => {
    const map = new Map<string, { open: number; high: number; ideas: number }>();
    for (const task of tasks) {
      const entry = map.get(task.nodeId) || { open: 0, high: 0, ideas: 0 };
      if (isOpen(task.status)) { entry.open += 1; if (task.priority === 'Hoog') entry.high += 1; }
      if (task.status === 'Idee') entry.ideas += 1;
      map.set(task.nodeId, entry);
    }
    return map;
  }, [tasks]);

  const totals = useMemo(() => ({
    open: tasks.filter((task) => isOpen(task.status)).length,
    high: tasks.filter((task) => isOpen(task.status) && task.priority === 'Hoog').length,
    busy: tasks.filter((task) => task.status === 'Bezig').length,
    ideas: tasks.filter((task) => task.status === 'Idee').length,
    done: tasks.filter((task) => task.status === 'Klaar').length,
  }), [tasks]);

  const query = search.trim().toLowerCase();
  const matchesNode = (node: MapNodeInfo) => !query || `${node.name} ${node.summary} ${node.functions.join(' ')} ${node.path || ''}`.toLowerCase().includes(query);

  if (auth === 'unknown') return <div className="p-8 text-sm text-slate-600">{error || 'Laden…'}</div>;
  if (auth === 'denied') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-extrabold text-slate-900">FDP overzichtskaart</h1>
          <p className="text-sm text-slate-600">Alleen voor de beheerder.</p>
          <label className="block text-sm font-bold text-slate-700">Beheerderswachtwoord
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 text-base" />
          </label>
          {loginError && <p role="alert" className="text-sm font-semibold text-rose-700">{loginError}</p>}
          <button type="submit" className="min-h-[48px] w-full rounded-xl bg-slate-900 text-sm font-extrabold text-white hover:bg-slate-700">Inloggen</button>
        </form>
      </main>
    );
  }

  const selected = selectedId ? nodeById.get(selectedId) || null : null;
  const topTasks = tasks.filter((task) => isOpen(task.status) && task.priority === 'Hoog').slice(0, 6);
  const filteredTasks = tasks.filter((task) =>
    (!fSource || task.source === fSource) && (!fPriority || task.priority === fPriority) &&
    (fStatus === 'open' ? isOpen(task.status) || task.status === 'Idee' : task.status === fStatus) &&
    (!query || `${task.title} ${task.what} ${nodeById.get(task.nodeId)?.name || ''}`.toLowerCase().includes(query)),
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-lg font-extrabold">FDP overzichtskaart</h1>
            <p className="text-xs text-slate-500">Wat er is, wat het doet en wat er nog moet gebeuren</p>
          </div>
          <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Weergave">
            {([['kaart', 'Kaart'], ['taken', `Taken (${totals.open})`]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`min-h-[44px] rounded-lg px-4 text-sm font-extrabold ${tab === id ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </nav>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoeken…" aria-label="Zoeken" className="min-h-[44px] w-44 rounded-lg border border-slate-300 px-3 text-sm" />
          <button type="button" onClick={() => setIdeaOpen(true)} className="min-h-[44px] rounded-xl bg-[#e31c24] px-4 text-sm font-extrabold text-white hover:bg-[#b8141a]">＋ Idee toevoegen</button>
          <a href="/map?view=3d" className="text-xs font-bold text-slate-500 underline">3D-weergave</a>
          <span className="w-20 text-right text-xs text-slate-500" aria-live="polite">{saved === 'saving' ? 'Opslaan…' : saved === 'saved' ? 'Opgeslagen' : saved === 'error' ? 'Niet opgeslagen' : ''}</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Samenvatting">
          {[
            ['Openstaande taken', totals.open, 'text-slate-900'],
            ['Hoge prioriteit', totals.high, 'text-rose-700'],
            ['Bezig', totals.busy, 'text-sky-700'],
            ['Ideeën', totals.ideas, 'text-violet-700'],
            ['Klaar', totals.done, 'text-emerald-700'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        {tab === 'kaart' ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
            <div className="space-y-5">
              {topTasks.length > 0 && (
                <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <h2 className="text-sm font-extrabold text-rose-900">Hier begin je (hoge prioriteit)</h2>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {topTasks.map((task) => (
                      <li key={task.id}><button type="button" onClick={() => setSelectedId(task.nodeId)} className="w-full rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-rose-100"><span className="font-bold">{task.title}</span> <span className="text-xs text-slate-500">· {nodeById.get(task.nodeId)?.name}</span></button></li>
                    ))}
                  </ul>
                </section>
              )}
              {LAYERS.map((layer) => {
                const nodes = NODES.filter((node) => node.layer === layer.id && matchesNode(node));
                if (nodes.length === 0) return null;
                return (
                  <section key={layer.id} aria-labelledby={`l-${layer.id}`}>
                    <h2 id={`l-${layer.id}`} className="text-base font-extrabold">{layer.title}</h2>
                    <p className="mb-2 text-xs text-slate-500">{layer.hint}</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {nodes.map((node) => {
                        const counts = openByNode.get(node.id) || { open: 0, high: 0, ideas: 0 };
                        return (
                          <button key={node.id} type="button" onClick={() => setSelectedId(node.id)} aria-pressed={selectedId === node.id} className={`flex min-h-[110px] flex-col gap-2 rounded-xl border bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-sm ${selectedId === node.id ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200'}`}>
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-sm font-extrabold leading-snug">{node.name}</span>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${STATUS_STYLE[node.status]}`}>{node.status}</span>
                            </span>
                            <span className="text-xs text-slate-600">{node.summary}</span>
                            <span className="mt-auto flex flex-wrap gap-1.5 text-[11px] font-bold">
                              {counts.high > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{counts.high} hoog</span>}
                              {counts.open - counts.high > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{counts.open - counts.high} te doen</span>}
                              {counts.ideas > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">{counts.ideas} {counts.ideas === 1 ? 'idee' : 'ideeën'}</span>}
                              {counts.open === 0 && counts.ideas === 0 && <span className="text-emerald-700">Niets open</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <aside aria-label="Details" className="lg:sticky lg:top-24 lg:self-start">
              {selected ? (
                <NodePanel node={selected} tasks={tasks.filter((task) => task.nodeId === selected.id)} nodeById={nodeById} onStatus={setStatus} onRemove={removeIdea} onSelect={setSelectedId} onIdea={addIdea} onClose={() => setSelectedId(null)} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                  <p className="font-extrabold text-slate-800">Kies een onderdeel</p>
                  <p className="mt-1">Klik links op een kaart om te zien wat het doet, hoe het scherm eruitziet, wat er nog moet gebeuren en om ideeën toe te voegen.</p>
                  <p className="mt-3 text-xs text-slate-500">Rood = hoge prioriteit uit een analyse of test. Groen = niets meer open.</p>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <section aria-label="Taken">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={fStatus} onChange={(event) => setFStatus(event.target.value as TaskStatus | 'open')} aria-label="Status" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">
                <option value="open">Open en ideeën</option>
                {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={fSource} onChange={(event) => setFSource(event.target.value as TaskSource | '')} aria-label="Bron" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">
                <option value="">Alle bronnen</option>
                {SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
              <select value={fPriority} onChange={(event) => setFPriority(event.target.value as Priority | '')} aria-label="Prioriteit" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">
                <option value="">Alle prioriteiten</option>
                {(['Hoog', 'Middel', 'Laag'] as Priority[]).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
              <span className="text-sm text-slate-500">{filteredTasks.length} taken</span>
            </div>
            <ul className="space-y-2">
              {filteredTasks.sort((a, b) => ['Hoog', 'Middel', 'Laag'].indexOf(a.priority) - ['Hoog', 'Middel', 'Laag'].indexOf(b.priority)).map((task) => (
                <TaskRow key={task.id} task={task} nodeName={nodeById.get(task.nodeId)?.name || ''} onStatus={setStatus} onShow={() => { setSelectedId(task.nodeId); setTab('kaart'); }} onRemove={task.custom ? () => removeIdea(task.id) : undefined} />
              ))}
              {filteredTasks.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Geen taken met deze filters.</li>}
            </ul>
          </section>
        )}
      </div>

      {ideaOpen && <IdeaDialog defaultNodeId={selectedId || NODES[0].id} onClose={() => setIdeaOpen(false)} onAdd={(idea) => { addIdea(idea); setIdeaOpen(false); }} />}
    </main>
  );
}

/* ----------------------------- Onderdelen ----------------------------- */

function TaskRow({ task, nodeName, onStatus, onShow, onRemove }: { task: MapTask; nodeName: string; onStatus: (id: string, status: TaskStatus) => void; onShow?: () => void; onRemove?: () => void }) {
  return (
    <li className={`rounded-xl border p-3 ${task.status === 'Klaar' || task.status === 'Niet doen' ? 'bg-slate-50 opacity-75' : 'bg-white'} border-slate-200`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-extrabold ${task.status === 'Klaar' ? 'line-through' : ''}`}>{task.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{task.what}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">{task.effort}</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">{task.source}</span>
            {onShow && <button type="button" onClick={onShow} className="text-slate-700 underline">Op de kaart: {nodeName}</button>}
            {task.where && <span className="font-mono font-normal text-slate-500">{task.where}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={task.status} onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)} aria-label={`Status van ${task.title}`} className={`min-h-[44px] rounded-lg border px-2 text-sm font-bold ${TASK_STATUS_STYLE[task.status]}`}>
            {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          {onRemove && <button type="button" onClick={onRemove} aria-label={`Verwijder ${task.title}`} className="min-h-[44px] rounded-lg px-3 text-sm font-bold text-rose-700 hover:bg-rose-50">Verwijder</button>}
        </div>
      </div>
    </li>
  );
}

function NodePanel({ node, tasks, nodeById, onStatus, onRemove, onSelect, onIdea, onClose }: {
  node: MapNodeInfo; tasks: MapTask[]; nodeById: Map<string, MapNodeInfo>;
  onStatus: (id: string, status: TaskStatus) => void; onRemove: (id: string) => void; onSelect: (id: string) => void;
  onIdea: (idea: { title: string; what: string; nodeId: string; priority: Priority }) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const open = tasks.filter((task) => isOpen(task.status));
  const ideas = tasks.filter((task) => task.status === 'Idee');
  const done = tasks.filter((task) => task.status === 'Klaar' || task.status === 'Niet doen');
  const dependsOn = (node.dependsOn || []).map((id) => nodeById.get(id)).filter(Boolean) as MapNodeInfo[];
  const usedBy = NODES.filter((other) => (other.dependsOn || []).includes(node.id));
  const analyses = open.filter((task) => task.source === 'Juridisch en privacy' || task.source === 'Beveiliging' || task.source === 'Website-analyse');

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold leading-snug">{node.name}</h2>
          <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${STATUS_STYLE[node.status]}`}>{node.status}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Sluiten" className="min-h-[44px] rounded-lg px-3 text-sm font-bold text-slate-500 hover:bg-slate-100">✕</button>
      </div>
      <p className="text-sm text-slate-700">{node.summary}</p>

      {node.wire && (
        <div>
          <Wireframe kind={node.wire} />
          <p className="mt-1 text-[10px] text-slate-400">Schematische weergave, geen schermafbeelding.</p>
        </div>
      )}

      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Wat doet het</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{node.functions.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>

      {(node.path || node.url) && (
        <dl className="space-y-1 text-xs text-slate-600">
          {node.path && <div><dt className="inline font-bold">Waar in de code: </dt><dd className="inline font-mono">{node.path}</dd></div>}
          {node.url && <div><dt className="inline font-bold">Adres: </dt><dd className="inline">{node.url.startsWith('http') ? <a href={node.url} target="_blank" rel="noreferrer" className="underline">{node.url}</a> : <span className="font-mono">{node.url}</span>}</dd></div>}
        </dl>
      )}

      {(dependsOn.length > 0 || usedBy.length > 0) && (
        <div className="space-y-1 text-xs">
          {dependsOn.length > 0 && <p><span className="font-bold text-slate-600">Gebruikt: </span>{dependsOn.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="mr-1.5 underline">{item.name}</button>)}</p>}
          {usedBy.length > 0 && <p><span className="font-bold text-slate-600">Wordt gebruikt door: </span>{usedBy.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="mr-1.5 underline">{item.name}</button>)}</p>}
        </div>
      )}

      {analyses.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900">Uit analyses: wat hier nog moet</h3>
          <ul className="mt-1 space-y-1 text-xs text-amber-950">{analyses.map((task) => <li key={task.id}><span className="font-bold">{task.source}:</span> {task.title}</li>)}</ul>
        </div>
      )}

      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Taken ({open.length})</h3>
        <ul className="mt-1 space-y-2">
          {open.map((task) => <TaskRow key={task.id} task={task} nodeName={node.name} onStatus={onStatus} onRemove={task.custom ? () => onRemove(task.id) : undefined} />)}
          {open.length === 0 && <li className="text-sm text-slate-500">Geen openstaande taken.</li>}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Ideeën ({ideas.length})</h3>
        <ul className="mt-1 space-y-2">
          {ideas.map((task) => <TaskRow key={task.id} task={task} nodeName={node.name} onStatus={onStatus} onRemove={task.custom ? () => onRemove(task.id) : undefined} />)}
        </ul>
        <form className="mt-2 space-y-2 rounded-lg bg-violet-50 p-3" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onIdea({ title: title.trim(), what: what.trim(), nodeId: node.id, priority: 'Laag' }); setTitle(''); setWhat(''); }}>
          <label className="block text-xs font-bold text-violet-900">Nieuw idee voor dit onderdeel
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder="Korte titel" className="mt-1 min-h-[44px] w-full rounded-lg border border-violet-200 bg-white px-3 text-sm font-normal" />
          </label>
          <textarea value={what} onChange={(event) => setWhat(event.target.value)} maxLength={600} rows={2} placeholder="Toelichting (optioneel)" aria-label="Toelichting" className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm" />
          <button type="submit" disabled={!title.trim()} className="min-h-[44px] rounded-lg bg-violet-700 px-4 text-sm font-extrabold text-white disabled:opacity-40">Idee toevoegen</button>
        </form>
      </div>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold text-slate-500">Klaar of niet doen ({done.length})</summary>
          <ul className="mt-2 space-y-2">{done.map((task) => <TaskRow key={task.id} task={task} nodeName={node.name} onStatus={onStatus} onRemove={task.custom ? () => onRemove(task.id) : undefined} />)}</ul>
        </details>
      )}
    </div>
  );
}

function IdeaDialog({ defaultNodeId, onClose, onAdd }: { defaultNodeId: string; onClose: () => void; onAdd: (idea: { title: string; what: string; nodeId: string; priority: Priority }) => void }) {
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [nodeId, setNodeId] = useState(defaultNodeId);
  const [priority, setPriority] = useState<Priority>('Laag');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Idee toevoegen" className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <form onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (title.trim()) onAdd({ title: title.trim(), what: what.trim(), nodeId, priority }); }} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5">
        <h2 className="text-lg font-extrabold">Idee toevoegen</h2>
        <label className="block text-sm font-bold">Titel
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
        </label>
        <label className="block text-sm font-bold">Bij welk onderdeel hoort het?
          <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
            {NODES.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold">Toelichting
          <textarea value={what} onChange={(event) => setWhat(event.target.value)} maxLength={600} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
        </label>
        <label className="block text-sm font-bold">Hoe belangrijk?
          <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
            <option>Hoog</option><option>Middel</option><option>Laag</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">Annuleren</button>
          <button type="submit" disabled={!title.trim()} className="min-h-[48px] rounded-xl bg-[#e31c24] px-5 text-sm font-extrabold text-white disabled:opacity-40">Toevoegen</button>
        </div>
      </form>
    </div>
  );
}
