import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FileThumb, getUploadFileType, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, readFileAsDataUrl } from './ticket/TicketTools';
import { formatWhen, helpRequestsOf, orderProgress, type AnyOrder } from '../utils/orderProgress';

const ImpositionModal = lazy(() => import('./ImpositionModal'));

type Act = (body: Record<string, unknown>) => Promise<boolean>;

const HELP_SUGGESTIONS = [
  'Kun je dit printen en snijden?',
  'Kun je dit opmaken?',
  'Kun je de klant bellen?',
  'Kun je dit inpakken en klaarzetten?',
  'Kun je dit controleren?',
];

const HELP_STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: 'Wacht op antwoord', tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  accepted: { label: 'Geaccepteerd', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  declined: { label: 'Kan niet helpen', tone: 'border-rose-200 bg-rose-50 text-rose-900' },
  done: { label: 'Klaar', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  cancelled: { label: 'Ingetrokken', tone: 'border-slate-200 bg-slate-50 text-slate-500' },
};

const btn = 'min-h-[44px] rounded-xl px-4 text-sm font-extrabold active:scale-[0.98] disabled:opacity-50';

/** Grote badge: wie is hiermee bezig? Met één tik "ik pak dit op". */
export function WhoBadge({ order, me, canAssign, onAssign }: { order: AnyOrder; me: string; canAssign: boolean; onAssign: (name: string) => void }) {
  if (order.assignedStaff) {
    return (
      <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-sm font-extrabold text-emerald-900">
        <span aria-hidden>👤</span> {order.assignedStaff} is bezig
        {canAssign && me && me !== order.assignedStaff && (
          <button type="button" onClick={(event) => { event.stopPropagation(); onAssign(me); }} className="ml-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100">
            Overnemen
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-extrabold text-amber-900">
      <span aria-hidden>⚠</span> Nog niemand bezig
      {canAssign && me && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onAssign(me); }} className="ml-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700">
          Ik pak dit op
        </button>
      )}
    </span>
  );
}

/** Kleine voortgangsbalk voor in de kaartkop. */
export function ProgressMini({ order }: { order: AnyOrder }) {
  const steps = orderProgress(order);
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  return (
    <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500" title={next ? `Volgende: ${next.label}` : 'Alles gedaan'}>
      <span className="flex gap-0.5">
        {steps.map((step) => <span key={step.key} className={`h-1.5 w-4 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}
      </span>
      {done}/{steps.length}{next ? ` · nu: ${next.label}` : ' · klaar'}
    </span>
  );
}

/** Wat is er gedaan (met naam en tijd) en wat moet nog. */
export function ProgressPanel({ order }: { order: AnyOrder }) {
  const steps = orderProgress(order);
  const todo = steps.filter((step) => !step.done);
  const done = steps.filter((step) => step.done);
  const help = helpRequestsOf(order).filter((item) => item.status === 'open' || item.status === 'accepted');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <h5 className="text-xs font-extrabold uppercase tracking-widest text-amber-900">Nog te doen ({todo.length + help.length})</h5>
        {todo.length + help.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-emerald-800">Alles is gedaan ✓</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {todo.map((step, index) => (
              <li key={step.key} className="flex gap-2 text-sm">
                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${index === 0 ? 'border-amber-600 bg-amber-200' : 'border-amber-300'}`} />
                <span>
                  <strong className={index === 0 ? 'text-slate-900' : 'text-slate-700'}>{step.label}</strong>
                  {step.detail && <span className="block text-[11px] text-slate-600">{step.detail}</span>}
                </span>
              </li>
            ))}
            {help.map((item) => (
              <li key={item.id} className="flex gap-2 text-sm">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-indigo-400 bg-indigo-100" />
                <span>
                  <strong className="text-slate-900">Hulp: {item.to}</strong>
                  <span className="block text-[11px] text-slate-600">{item.message} · {item.status === 'open' ? 'wacht op antwoord' : 'geaccepteerd'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <h5 className="text-xs font-extrabold uppercase tracking-widest text-emerald-900">Al gedaan ({done.length})</h5>
        <ul className="mt-2 space-y-1.5">
          {done.map((step) => (
            <li key={step.key} className="flex gap-2 text-sm">
              <span className="mt-0.5 shrink-0 text-emerald-700">✓</span>
              <span>
                <strong className="text-slate-800">{step.label}</strong>
                {(step.who || step.when) && (
                  <span className="block text-[11px] text-slate-600">{[step.who, formatWhen(step.when)].filter(Boolean).join(' · ')}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Hulp vragen aan een collega; de collega accepteert of weigert. */
export function HelpRequestBox({ order, staff, me, isAdmin, canAsk, act }: { order: AnyOrder; staff: AnyOrder[]; me: string; isAdmin: boolean; canAsk: boolean; act: Act }) {
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const requests = helpRequestsOf(order);
  const names = staff.map((member) => String(member.name)).filter((name) => name !== me);

  const send = async () => {
    if (!to || !message.trim()) return;
    setBusy(true);
    if (await act({ helpRequest: { action: 'create', to, message: message.trim() } })) {
      setMessage('');
    }
    setBusy(false);
  };

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <h5 className="text-xs font-extrabold uppercase tracking-widest text-indigo-900">Hulp vragen aan een collega</h5>
      {canAsk && (
        <div className="mt-2 space-y-2">
          <select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Collega" className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
            <option value="">Kies een collega…</option>
            {names.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {HELP_SUGGESTIONS.map((text) => (
              <button key={text} type="button" onClick={() => setMessage(text)} className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100">{text}</button>
            ))}
          </div>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={2} placeholder="Wat moet er gebeuren? Bijvoorbeeld: 200 flyers A5 printen en snijden." className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm" />
          <button type="button" disabled={busy || !to || !message.trim()} onClick={send} className={`${btn} bg-indigo-700 text-white hover:bg-indigo-800`}>
            {busy ? 'Versturen…' : '🙋 Hulp vragen'}
          </button>
        </div>
      )}
      {requests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {[...requests].reverse().map((item) => {
            const status = HELP_STATUS[item.status] || HELP_STATUS.open;
            const mine = item.to === me || isAdmin;
            return (
              <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-900">{item.from} → {item.to}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>{status.label}</span>
                </div>
                <p className="mt-1 text-slate-700">{item.message}</p>
                <p className="text-[10px] text-slate-400">{formatWhen(item.createdAt)}{item.reply ? ` · "${item.reply}"` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.status === 'open' && mine && (
                    <>
                      <button type="button" onClick={() => act({ helpRequest: { action: 'accepted', id: item.id } })} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>✓ Accepteren</button>
                      <button type="button" onClick={() => { const reply = window.prompt('Waarom lukt het niet? (mag leeg blijven)', ''); if (reply !== null) act({ helpRequest: { action: 'declined', id: item.id, reply } }); }} className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>Kan niet</button>
                    </>
                  )}
                  {item.status === 'accepted' && (mine || item.from === me) && (
                    <button type="button" onClick={() => act({ helpRequest: { action: 'done', id: item.id } })} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>Klaar gemeld</button>
                  )}
                  {item.status === 'open' && (item.from === me || isAdmin) && (
                    <button type="button" onClick={() => act({ helpRequest: { action: 'cancel', id: item.id } })} className="min-h-[44px] rounded-xl px-3 text-xs font-bold text-slate-500 underline">Intrekken</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Extra info + extra bijlagen bij de productspecificatie; altijd direct zichtbaar. */
export function ExtraSpecBox({ order, me, canEdit, canFiles, act, onChanged }: { order: AnyOrder; me: string; canEdit: boolean; canFiles: boolean; act: Act; onChanged: () => void }) {
  const saved = String(order.extraInfo || '');
  const [text, setText] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const files: AnyOrder[] = (Array.isArray(order.extraFiles) ? order.extraFiles : []).filter((file: AnyOrder) => !file.printReady);

  // Nieuwe versie van de server overschrijft alleen als je niet zelf aan het typen bent.
  useEffect(() => { if (!dirty) setText(saved); }, [saved, dirty]);

  const save = async () => {
    setBusy(true);
    if (await act({ extraInfo: text })) setDirty(false);
    setBusy(false);
  };

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError('');
    for (const file of Array.from(list)) {
      const fileType = getUploadFileType(file);
      if (!fileType) { setError(`${file.name}: alleen PDF, PNG of JPG.`); continue; }
      if (file.size > MAX_UPLOAD_BYTES) { setError(`${file.name}: maximaal ${MAX_UPLOAD_LABEL}.`); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ file: { fileName: file.name, fileType, dataUrl }, label: label.trim(), actingAs: me || undefined }),
        });
        if (!response.ok) setError(((await response.json().catch(() => ({}))) as any).error || `${file.name}: uploaden mislukt.`);
      } catch {
        setError(`${file.name}: uploaden mislukt.`);
      }
    }
    setLabel('');
    if (inputRef.current) inputRef.current.value = '';
    setBusy(false);
    onChanged();
  };

  const remove = async (file: AnyOrder) => {
    if (!window.confirm(`"${file.fileName}" verwijderen?`)) return;
    const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/attachments/${encodeURIComponent(file.id)}${me ? `?actingAs=${encodeURIComponent(me)}` : ''}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) window.alert(((await response.json().catch(() => ({}))) as any).error || 'Verwijderen mislukt.');
    onChanged();
  };

  return (
    <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <h5 className="text-xs font-extrabold uppercase tracking-widest text-sky-900">Extra info en bijlagen (intern)</h5>
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(event) => { setText(event.target.value); setDirty(true); }}
          disabled={!canEdit}
          maxLength={3000}
          rows={3}
          placeholder="Extra info voor de werkplaats: afwerking, snijden, kleur, bijzonderheden…"
          className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm disabled:bg-slate-50"
        />
        {canEdit && dirty && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className={`${btn} bg-sky-700 text-white hover:bg-sky-800`}>Opslaan</button>
            <button type="button" onClick={() => { setText(saved); setDirty(false); }} className="min-h-[44px] rounded-xl px-3 text-xs font-bold text-slate-500 underline">Annuleren</button>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => {
            const url = `/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.id)}`;
            return (
              <li key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                <FileThumb remoteUrl={url} fileName={file.fileName} fileType={file.fileType} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800" title={file.fileName}>{file.fileName}</p>
                  <p className="text-[11px] text-slate-500">{file.label ? `${file.label} · ` : ''}{file.by ? `${file.by} · ` : ''}{formatWhen(file.uploadedAt)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <a href={url} className="inline-flex min-h-[44px] items-center rounded-xl bg-sky-700 px-4 text-sm font-extrabold text-white hover:bg-sky-800">Open</a>
                  {canFiles && <button type="button" onClick={() => remove(file)} aria-label={`${file.fileName} verwijderen`} className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-rose-50">🗑</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canFiles && (
        <div className="space-y-2 rounded-lg border border-dashed border-sky-300 bg-white p-2.5">
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={200} placeholder="Korte omschrijving (optioneel), bijvoorbeeld: snijlijn" className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={(event) => upload(event.target.files)} className="block w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-sky-700 file:px-4 file:text-sm file:font-extrabold file:text-white" />
          <p className="text-[11px] text-slate-500">PDF, PNG of JPG, maximaal {MAX_UPLOAD_LABEL} per bestand. De klant ziet deze bijlagen niet.</p>
          {busy && <p className="text-[11px] font-bold text-sky-800">Bezig…</p>}
          {error && <p className="text-[11px] font-bold text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}

/** Melding voor de ingelogde medewerker: hulpvragen die op antwoord wachten en hulp die je hebt toegezegd. */
export function MyHelpBanner({ orders, me, onOpenOrder, act }: { orders: AnyOrder[]; me: string; onOpenOrder: (order: AnyOrder) => void; act: (orderId: string, body: Record<string, unknown>) => Promise<boolean> }) {
  if (!me) return null;
  const rows: Array<{ order: AnyOrder; item: any }> = [];
  for (const order of orders) for (const item of helpRequestsOf(order)) if (item.to === me && (item.status === 'open' || item.status === 'accepted')) rows.push({ order, item });
  if (rows.length === 0) return null;
  rows.sort((a, b) => Number(b.item.status === 'open') - Number(a.item.status === 'open'));
  return (
    <section className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-3" aria-live="polite">
      <h4 className="text-sm font-extrabold text-indigo-900">🙋 {rows.filter((row) => row.item.status === 'open').length > 0 ? `${me}, collega's vragen om hulp` : `${me}, hier help je mee`}</h4>
      <ul className="mt-2 space-y-2">
        {rows.map(({ order, item }) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-slate-900">{item.from}: {item.message}</p>
              <button type="button" onClick={() => onOpenOrder(order)} className="text-[11px] font-bold text-indigo-800 underline">Opdracht {order.order_number || order.id} · {order.contact_person || order.clientName}</button>
            </div>
            <div className="flex gap-2">
              {item.status === 'open' ? (
                <>
                  <button type="button" onClick={() => act(order.id, { helpRequest: { action: 'accepted', id: item.id } })} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>✓ Accepteren</button>
                  <button type="button" onClick={() => { const reply = window.prompt('Waarom lukt het niet? (mag leeg blijven)', ''); if (reply !== null) act(order.id, { helpRequest: { action: 'declined', id: item.id, reply } }); }} className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>Kan niet</button>
                </>
              ) : (
                <button type="button" onClick={() => act(order.id, { helpRequest: { action: 'done', id: item.id } })} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>Klaar gemeld</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/** Ingeslagen vellen die klaar zijn om te printen. */
export function PrintReadyBox({ order, canFiles, me, onChanged }: { order: AnyOrder; canFiles: boolean; me: string; onChanged: () => void }) {
  const files: AnyOrder[] = (Array.isArray(order.extraFiles) ? order.extraFiles : []).filter((file: AnyOrder) => file.printReady);
  if (files.length === 0) return null;
  const remove = async (file: AnyOrder) => {
    if (!window.confirm(`"${file.fileName}" verwijderen?`)) return;
    const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/attachments/${encodeURIComponent(file.id)}${me ? `?actingAs=${encodeURIComponent(me)}` : ''}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) window.alert(((await response.json().catch(() => ({}))) as any).error || 'Verwijderen mislukt.');
    onChanged();
  };
  return (
    <section className="space-y-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3">
      <h5 className="text-sm font-extrabold uppercase tracking-wide text-emerald-900">✓ Klaar om te printen</h5>
      {files.map((file) => {
        const url = `/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.id)}`;
        return (
          <div key={file.id} className="space-y-2 rounded-lg bg-white p-3">
            <div className="flex items-center gap-3">
              <FileThumb remoteUrl={url} fileName={file.fileName} fileType={file.fileType} size={56} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-extrabold text-slate-900">{file.fileName}</p>
                <p className="text-[11px] text-slate-600">{file.label ? `${file.label} · ` : ''}{file.by ? `${file.by} · ` : ''}{formatWhen(file.uploadedAt)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={url} className="inline-flex min-h-[48px] items-center rounded-xl bg-emerald-700 px-5 text-sm font-extrabold text-white hover:bg-emerald-800">⬇ Downloaden en printen</a>
              {canFiles && <button type="button" onClick={() => remove(file)} className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-rose-50">Verwijderen</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Bestanden van de klant: origineel downloaden of imposeren (meerdere op een vel). */
export function CustomerFilesBox({ order, lines, me, canPrepress, onChanged }: { order: AnyOrder; lines: AnyOrder[]; me: string; canPrepress: boolean; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const files: AnyOrder[] = Array.isArray(order.customerFiles) ? order.customerFiles : [];
  if (files.length === 0) return null;

  const savePrintReady = async (pdf: Uint8Array, fileName: string, note: string): Promise<string | null> => {
    if (pdf.length > 20 * 1024 * 1024) return 'Het ingeslagen bestand is groter dan 20 MB en kan niet bij de opdracht worden bewaard. Gebruik "Alleen pdf downloaden".';
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ file: { fileName, fileType: 'application/pdf', dataUrl: `data:application/pdf;base64,${toBase64(pdf)}` }, label: note, printReady: true, actingAs: me || undefined }),
      });
      if (!response.ok) return ((await response.json().catch(() => ({}))) as any).error || 'Opslaan bij de opdracht is mislukt.';
      onChanged();
      return null;
    } catch {
      return 'De server is niet bereikbaar.';
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-700">Bestanden van de klant</h5>
      {files.map((file) => {
        const url = `/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.id)}`;
        const line = lines.find((item) => item.id && item.id === file.productLineId);
        return (
          <div key={file.id} className="space-y-3 rounded-lg bg-white p-3">
            <div className="flex items-center gap-3">
              <FileThumb remoteUrl={url} fileName={file.fileName} fileType={file.fileType} size={56} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-extrabold text-slate-900" title={file.fileName}>{file.fileName}</p>
                <p className="text-[11px] text-slate-500">
                  {file.productName ? `${file.productName} · ${file.productQuantity} stuks` : file.side === 'back' ? 'Achterzijde' : 'Voorzijde'} · {(file.size / (1024 * 1024)).toFixed(2)} MB · {new Date(file.uploadedAt).toLocaleDateString('nl-NL')}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={url} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 hover:bg-slate-50">⬇ Origineel downloaden</a>
              <button type="button" disabled={!canPrepress} onClick={() => setOpenId(file.id)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#e31c24] px-4 text-sm font-extrabold text-white hover:bg-[#b8141a] disabled:opacity-50">🧩 Imposeren (SRA3)</button>
            </div>
            {!canPrepress && <p className="text-[11px] text-slate-500">Imposeren mag alleen met het recht “Pre-press”. Vraag de beheerder.</p>}
            {openId === file.id && (
              <Suspense fallback={null}>
                <ImpositionModal
                  fileUrl={url}
                  fileName={file.fileName}
                  fileType={file.fileType}
                  productName={file.productName || order.selectedProductName}
                  defaultWidthMm={Number(line?.widthMm || order.customWidth) || undefined}
                  defaultHeightMm={Number(line?.heightMm || order.customHeight) || undefined}
                  onPrintReady={savePrintReady}
                  onClose={() => setOpenId(null)}
                />
              </Suspense>
            )}
          </div>
        );
      })}
    </section>
  );
}
