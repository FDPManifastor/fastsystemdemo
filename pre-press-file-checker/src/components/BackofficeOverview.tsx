import { useMemo, useState } from 'react';

type AnyOrder = Record<string, any>;

interface BackofficeOverviewProps {
  orders: AnyOrder[];
  branches: string[];
  isAdmin: boolean;
  onOpenOrder: (order: AnyOrder) => void;
  onNewTicket?: () => void;
  onShowOrders: () => void;
}

const DONE_STATUS = 'Verzonden';
const STATUS_FLOW = ['Ingediend', 'In Controle', 'Preflight Goedgekeurd', 'Actie Vereist', 'In Druk', 'Klaar voor Afhalen', DONE_STATUS];
const STATUS_COLOR: Record<string, string> = {
  Ingediend: 'bg-slate-400',
  'In Controle': 'bg-amber-400',
  'Preflight Goedgekeurd': 'bg-sky-500',
  'Actie Vereist': 'bg-rose-500',
  'In Druk': 'bg-indigo-500',
  'Klaar voor Afhalen': 'bg-emerald-500',
  [DONE_STATUS]: 'bg-slate-300',
};

const euro = (value: number) => `€ ${value.toFixed(2).replace('.', ',')}`;
const orderLabel = (order: AnyOrder) => String(order.order_number || order.id || '');
const customerName = (order: AnyOrder) => String(order.contact_person || order.clientName || 'Onbekende klant');
const orderStatus = (order: AnyOrder) => String(order.status || 'Ingediend');
const isOpen = (order: AnyOrder) => orderStatus(order) !== DONE_STATUS;
const owed = (order: AnyOrder) => (order.payment_status && order.payment_status !== 'Volledig betaald' ? Math.max(0, Number(order.remaining ?? order.grand_total ?? 0)) : 0);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const daysBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / 86400000);
const lastStatusChange = (order: AnyOrder) => {
  const history = Array.isArray(order.history) ? order.history : [];
  const entry = [...history].reverse().find((item: any) => item?.date && !item.internal);
  return new Date(entry?.date || order.createdAt || Date.now()).getTime();
};

interface Row {
  order: AnyOrder;
  reason: string;
  tone?: 'red' | 'amber' | 'slate';
}

export default function BackofficeOverview({ orders, branches, isAdmin, onOpenOrder, onNewTicket, onShowOrders }: BackofficeOverviewProps) {
  const [branchFilter, setBranchFilter] = useState('');
  const today = startOfDay(new Date());

  const scoped = useMemo(
    () => (branchFilter ? orders.filter((order) => (order.branch || 'Amsterdam') === branchFilter) : orders),
    [orders, branchFilter],
  );

  const data = useMemo(() => {
    const open = scoped.filter(isOpen);

    const contact: Row[] = [];
    for (const order of open) {
      const status = orderStatus(order);
      const ageDays = daysBetween(startOfDay(new Date(lastStatusChange(order))), today);
      if (status === 'Actie Vereist') {
        contact.push({ order, reason: 'Bestand niet in orde: klant vragen om een nieuw bestand', tone: 'red' });
      } else if (status === 'Klaar voor Afhalen' && ageDays >= 2) {
        contact.push({ order, reason: `Ligt al ${ageDays} dagen klaar: klant eraan herinneren`, tone: 'amber' });
      } else if (order.order_type === 'opdrachtbon' && order.customer_approved === false && ageDays >= 1 && ['Ingediend', 'In Controle'].includes(status)) {
        contact.push({ order, reason: 'Nog geen akkoord van de klant op de bon', tone: 'amber' });
      }
    }

    const unpaid: Row[] = scoped
      .filter((order) => owed(order) > 0)
      .sort((a, b) => Number(orderStatus(b) === 'Klaar voor Afhalen') - Number(orderStatus(a) === 'Klaar voor Afhalen') || owed(b) - owed(a))
      .map((order) => ({
        order,
        reason: `${euro(owed(order))} openstaand${orderStatus(order) === 'Klaar voor Afhalen' ? ' · betalen bij afhalen' : orderStatus(order) === DONE_STATUS ? ' · al geleverd' : ''}`,
        tone: orderStatus(order) === DONE_STATUS ? 'red' : 'amber',
      }));

    const deadlines: Row[] = open
      .filter((order) => /^\d{4}-\d{2}-\d{2}$/.test(String(order.delivery_date || '')))
      .map((order) => {
        const [y, m, d] = String(order.delivery_date).split('-').map(Number);
        const diff = daysBetween(today, new Date(y, m - 1, d).getTime());
        return { order, diff };
      })
      .filter((entry) => entry.diff <= 2 && orderStatus(entry.order) !== 'Klaar voor Afhalen')
      .sort((a, b) => a.diff - b.diff)
      .map(({ order, diff }) => ({
        order,
        reason: diff < 0 ? `${Math.abs(diff)} dag${Math.abs(diff) === 1 ? '' : 'en'} te laat` : diff === 0 ? 'Vandaag klaar' : diff === 1 ? 'Morgen klaar' : 'Over 2 dagen klaar',
        tone: (diff < 0 ? 'red' : diff === 0 ? 'amber' : 'slate') as Row['tone'],
      }));

    const toDo: Row[] = open
      .filter((order) => ['Ingediend', 'In Controle', 'Preflight Goedgekeurd'].includes(orderStatus(order)))
      .map((order) => ({
        order,
        reason: orderStatus(order) === 'Ingediend' ? 'Nieuw: bestand controleren' : orderStatus(order) === 'In Controle' ? 'In controle: afronden' : 'Goedgekeurd: klaarzetten voor druk',
        tone: 'slate' as const,
      }));

    const byStatus = STATUS_FLOW.map((status) => ({ status, count: scoped.filter((order) => orderStatus(order) === status).length }));
    const newToday = scoped.filter((order) => order.createdAt && startOfDay(new Date(order.createdAt)) === today).length;
    const owedTotal = unpaid.reduce((sum, row) => sum + owed(row.order), 0);
    const unassigned = open.filter((order) => !order.assignedStaff).length;
    return { open, contact, unpaid, deadlines, toDo, byStatus, newToday, owedTotal, unassigned };
  }, [scoped, today]);

  const maxStatus = Math.max(1, ...data.byStatus.map((entry) => entry.count));

  const toneClass = (tone?: Row['tone']) =>
    tone === 'red' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700';

  const Card = ({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'red' | 'amber' | 'green' }) => (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${tone === 'red' ? 'border-rose-200' : tone === 'amber' ? 'border-amber-200' : tone === 'green' ? 'border-emerald-200' : 'border-slate-200'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );

  const Section = ({ title, subtitle, rows, empty }: { title: string; subtitle: string; rows: Row[]; empty: string }) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">{title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{rows.length}</span></h3>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 8).map((row) => (
            <li key={`${row.order.id}-${row.reason}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-slate-900">
                  #{orderLabel(row.order)} · {customerName(row.order)}
                  {isAdmin && <span className="ml-1.5 font-semibold text-slate-400">· {row.order.branch || 'Amsterdam'}</span>}
                </p>
                <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${toneClass(row.tone)}`}>{row.reason}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {row.order.clientPhone && <a href={`tel:${row.order.clientPhone}`} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50">Bel</a>}
                {row.order.clientEmail && <a href={`mailto:${row.order.clientEmail}`} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50">Mail</a>}
                <button type="button" onClick={() => onOpenOrder(row.order)} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-700">Open</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && (
        <button type="button" onClick={onShowOrders} className="mt-2 text-[11px] font-bold text-slate-600 underline">+ {rows.length - 8} meer, bekijk alle opdrachten</button>
      )}
    </section>
  );

  return (
    <div className="space-y-5 animate-fade-in font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">Vandaag</h3>
          <p className="text-xs text-slate-500">Wat staat er open en wat moet er nu gebeuren.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Filiaal" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="">Alle filialen</option>
              {branches.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {onNewTicket && (
            <button type="button" onClick={onNewTicket} className="rounded-lg bg-[#e31c24] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#b8141a]">+ Nieuwe opdrachtbon</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Open opdrachten" value={data.open.length} hint={`${data.newToday} nieuw vandaag`} />
        <Card label="Klant benaderen" value={data.contact.length} hint="bellen of mailen" tone={data.contact.length ? 'red' : 'green'} />
        <Card label="Nog te betalen" value={euro(data.owedTotal)} hint={`${data.unpaid.length} opdracht${data.unpaid.length === 1 ? '' : 'en'}`} tone={data.unpaid.length ? 'amber' : 'green'} />
        <Card label="Deadline" value={data.deadlines.filter((row) => row.tone !== 'slate').length} hint="vandaag of te laat" tone={data.deadlines.some((row) => row.tone === 'red') ? 'red' : undefined} />
        <Card label="Zonder medewerker" value={data.unassigned} hint="nog niemand eraan toegewezen" tone={data.unassigned ? 'amber' : 'green'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Klant contacteren" subtitle="Hier wacht de klant op ons, of wij op de klant." rows={data.contact} empty="Niemand hoeft nu gebeld te worden." />
        <Section title="Betaling openstaand" subtitle="Eerst de opdrachten die klaarliggen of al geleverd zijn." rows={data.unpaid} empty="Alles is betaald." />
        <Section title="Deadlines" subtitle="Opdrachten met een leverdatum vandaag, te laat of binnen 2 dagen." rows={data.deadlines} empty="Geen deadlines die aandacht vragen." />
        <Section title="Nog op te pakken" subtitle="Nieuwe en goedgekeurde opdrachten die nog niet in de druk zijn." rows={data.toDo} empty="Alles is opgepakt." />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-extrabold text-slate-900">Opdrachten per status</h3>
        <div className="space-y-1.5">
          {data.byStatus.map((entry) => (
            <div key={entry.status} className="flex items-center gap-2 text-[11px]">
              <span className="w-36 shrink-0 font-semibold text-slate-600">{entry.status}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${STATUS_COLOR[entry.status] || 'bg-slate-400'}`} style={{ width: `${(entry.count / maxStatus) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-mono font-bold text-slate-700">{entry.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
