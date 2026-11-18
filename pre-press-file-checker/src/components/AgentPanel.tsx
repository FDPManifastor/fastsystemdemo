import { useMemo, useState } from 'react';

/** Bericht uit de Notion-database "Agent-berichten" (zie agentMessages.ts). */
export type AgentMessage = {
  id: string;
  nr: string;
  title: string;
  nodeId: string | null;
  agent: string;
  kind: string;
  text: string;
  priority: string;
  effort: string;
  status: string;
  github: string;
  replyTo: string | null;
  createdAt: string;
};

export const AGENT_COLORS: Record<string, string> = {
  Beveiliging: '#f87171',
  Snelheid: '#fb923c',
  Balie: '#60a5fa',
  'Klant & omzet': '#4ade80',
  Reviewer: '#c084fc',
  Uitvoerder: '#d6a77a',
  Beheerder: '#e5e7eb',
};

const STATUS_STYLE: Record<string, string> = {
  Nieuw: 'bg-amber-300/15 text-amber-200 border-amber-300/40',
  Goedgekeurd: 'bg-sky-400/15 text-sky-200 border-sky-400/40',
  'In uitvoering': 'bg-sky-400/15 text-sky-200 border-sky-400/40',
  'Klaar voor controle': 'bg-violet-400/15 text-violet-200 border-violet-400/40',
  Uitgevoerd: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/40',
  Afgewezen: 'bg-rose-400/10 text-rose-300 border-rose-400/30',
};

const ACTIONABLE = ['Idee', 'Waarschuwing'];
const CLOSED = ['Uitgevoerd', 'Afgewezen'];

/** Berichten waar de beheerder iets mee moet: nieuwe ideeën/vragen en klaargezette pull requests. */
export const needsAttention = (m: AgentMessage) =>
  m.agent !== 'Beheerder' && m.kind !== 'Reactie' && m.kind !== 'Resultaat' && (m.status === 'Nieuw' || m.status === 'Klaar voor controle');

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Server gaf status ${response.status}`);
  return data;
}

export default function AgentPanel({ nodeId, isRoot, messages, onChanged }: { nodeId: string; isRoot: boolean; messages: AgentMessage[]; onChanged: () => Promise<void> | void }) {
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { open, closed, replies } = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id));
    const repliesMap = new Map<string, AgentMessage[]>();
    const top: AgentMessage[] = [];
    for (const m of messages) {
      if (m.replyTo && ids.has(m.replyTo)) {
        const list = repliesMap.get(m.replyTo) || [];
        list.push(m);
        repliesMap.set(m.replyTo, list);
      } else top.push(m);
    }
    for (const list of repliesMap.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const sorted = top.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || b.createdAt.localeCompare(a.createdAt));
    return { open: sorted.filter((m) => !CLOSED.includes(m.status)), closed: sorted.filter((m) => CLOSED.includes(m.status)), replies: repliesMap };
  }, [messages]);

  const addIdea = async () => {
    if (!ideaText.trim()) return;
    setBusy(true);
    setError('');
    try {
      await post('/api/admin/map/messages', { kind: 'Idee', nodeId, text: ideaText.trim() });
      setIdeaText('');
      setIdeaOpen(false);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 border-t border-white/10 pt-4" aria-label="Agentberichten">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">🤖 Agents ({open.length})</h3>
        <button type="button" onClick={() => setIdeaOpen((x) => !x)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10">
          ＋ Eigen idee
        </button>
      </div>
      {isRoot && <p className="mt-1 text-[11px] text-slate-500">Hier staan ook berichten zonder (bekend) onderdeel.</p>}

      {ideaOpen && (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <textarea
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            rows={3}
            maxLength={1900}
            placeholder="Wat wil je hier verbeterd hebben? De agents reageren erop."
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIdeaOpen(false)} className="min-h-[40px] rounded-lg px-3 text-xs text-slate-400 hover:bg-white/10">Annuleren</button>
            <button type="button" disabled={busy || !ideaText.trim()} onClick={() => void addIdea()} className="min-h-[40px] rounded-lg bg-sky-500 px-3 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? 'Opslaan…' : 'Idee plaatsen'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}

      <div className="mt-2 space-y-2">
        {open.map((m) => <MessageCard key={m.id} message={m} replies={replies.get(m.id) || []} nodeId={nodeId} onChanged={onChanged} />)}
        {open.length === 0 && <p className="text-xs text-slate-500">Nog geen openstaande berichten van de agents.</p>}
      </div>

      {closed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">Afgehandeld ({closed.length})</summary>
          <div className="mt-2 space-y-2">
            {closed.map((m) => <MessageCard key={m.id} message={m} replies={replies.get(m.id) || []} nodeId={nodeId} onChanged={onChanged} />)}
          </div>
        </details>
      )}
    </section>
  );
}

function MessageCard({ message: m, replies, nodeId, onChanged }: { message: AgentMessage; replies: AgentMessage[]; nodeId: string; onChanged: () => Promise<void> | void }) {
  const [confirm, setConfirm] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const color = AGENT_COLORS[m.agent] || '#e5e7eb';
  const actionable = ACTIONABLE.includes(m.kind) && m.agent !== 'Beheerder';

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await task();
      await onChanged();
      setConfirm(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Er ging iets mis.');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (action: 'approve' | 'reject' | 'done') => run(() => post(`/api/admin/map/messages/${m.id}/status`, { action }));
  const sendReply = () =>
    run(async () => {
      await post('/api/admin/map/messages', { kind: 'Reactie', nodeId, replyTo: m.id, text: reply.trim() });
      setReply('');
      setReplyOpen(false);
    });

  const btn = 'min-h-[40px] rounded-lg px-3 text-xs font-semibold disabled:opacity-40';

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.04] p-3" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold" style={{ color }}>{m.agent || 'Agent'}</span>
        <span className="text-slate-500">· {m.kind}{m.nr ? ` · ${m.nr}` : ''} · {when(m.createdAt)}</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 ${STATUS_STYLE[m.status] || 'border-white/15 text-slate-300'}`}>{m.status}</span>
      </div>
      <h4 className="mt-1 text-sm font-semibold leading-snug">{m.title}</h4>
      {m.text && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-300">{m.text}</p>}
      {(m.priority || m.effort) && (
        <p className="mt-1.5 flex gap-1.5 text-[11px] text-slate-400">
          {m.priority && <span className="rounded-full bg-white/5 px-2 py-0.5">Prioriteit: {m.priority}</span>}
          {m.effort && <span className="rounded-full bg-white/5 px-2 py-0.5">Werk: {m.effort}</span>}
        </p>
      )}
      {m.github && (
        <a href={m.github} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky-300 underline">
          {m.github.includes('/pull/') ? 'Bekijk pull request ↗' : 'Bekijk op GitHub ↗'}
        </a>
      )}

      {replies.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
          {replies.map((r) => (
            <li key={r.id} className="text-xs">
              <span className="font-semibold" style={{ color: AGENT_COLORS[r.agent] || '#e5e7eb' }}>{r.agent}</span>
              <span className="text-slate-500"> · {when(r.createdAt)}</span>
              <p className="whitespace-pre-line text-slate-300">{r.text || r.title}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {actionable && (m.status === 'Nieuw' || m.status === 'Afgewezen') && !confirm && (
          <button type="button" disabled={busy} onClick={() => setConfirm(true)} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-400`}>
            {m.status === 'Afgewezen' ? 'Toch uitvoeren' : 'Uitvoeren'}
          </button>
        )}
        {actionable && m.status === 'Nieuw' && !confirm && (
          <button type="button" disabled={busy} onClick={() => void setStatus('reject')} className={`${btn} border border-rose-400/40 text-rose-200 hover:bg-rose-400/10`}>Afwijzen</button>
        )}
        {actionable && m.status === 'Klaar voor controle' && (
          <button type="button" disabled={busy} onClick={() => void setStatus('done')} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-400`}>Live gezet ✓</button>
        )}
        {!confirm && (
          <button type="button" onClick={() => setReplyOpen((x) => !x)} className={`${btn} border border-white/15 text-slate-200 hover:bg-white/10`}>Reageren</button>
        )}
      </div>

      {(m.status === 'Goedgekeurd' || m.status === 'In uitvoering') && (
        <p className="mt-2 text-[11px] text-sky-200">
          {m.status === 'Goedgekeurd' ? 'Goedgekeurd. De uitvoerder pakt dit bij de volgende ronde op en zet een pull request op staging klaar.' : 'Wordt nu uitgevoerd…'}
        </p>
      )}

      {confirm && (
        <div className="mt-2 space-y-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2.5 text-xs text-emerald-100">
          <p>De uitvoerder past de code aan en zet een pull request op <b>staging</b> klaar. Er gaat niets automatisch live. Doorgaan?</p>
          <div className="flex gap-1.5">
            <button type="button" disabled={busy} onClick={() => void setStatus('approve')} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-400`}>{busy ? 'Bezig…' : 'Ja, uitvoeren'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(false)} className={`${btn} text-slate-300 hover:bg-white/10`}>Annuleren</button>
          </div>
        </div>
      )}

      {replyOpen && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={1900}
            placeholder="Je reactie; de agents lezen dit bij hun volgende ronde."
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs outline-none focus:border-sky-400"
          />
          <div className="flex justify-end">
            <button type="button" disabled={busy || !reply.trim()} onClick={() => void sendReply()} className={`${btn} bg-sky-500 text-white hover:bg-sky-400`}>{busy ? 'Versturen…' : 'Versturen'}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs text-rose-300">{error}</p>}
    </article>
  );
}
