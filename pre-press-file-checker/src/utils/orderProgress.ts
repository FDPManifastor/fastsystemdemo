export type AnyOrder = Record<string, any>;

export interface ProgressStep {
  key: string;
  label: string;
  done: boolean;
  who?: string;
  when?: string;
  detail?: string;
}

const RANK: Record<string, number> = {
  Ingediend: 0,
  'Bestanden Ontvangen': 0,
  'In Controle': 1,
  'Actie Vereist': 1,
  'Preflight Goedgekeurd': 2,
  'In Druk': 3,
  'Klaar voor Afhalen': 4,
  Verzonden: 5,
};

export const statusRank = (order: AnyOrder) => RANK[order.status || 'Ingediend'] ?? 0;

const history = (order: AnyOrder): any[] => (Array.isArray(order.history) ? order.history : []);
const lastEntry = (order: AnyOrder, test: (entry: any) => boolean) => [...history(order)].reverse().find(test);

export const formatWhen = (value?: string) =>
  value ? new Date(value).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/** Wie zette de opdracht op deze status (alleen bekend voor wijzigingen sinds de naamregistratie). */
export function whoDidStatus(order: AnyOrder, status: string) {
  const entry = lastEntry(order, (item) => item?.status === status && !item.internal);
  return entry ? { who: entry.by as string | undefined, when: entry.date as string | undefined } : { who: undefined, when: undefined };
}

export const completedBy = (order: AnyOrder) => whoDidStatus(order, 'Verzonden');

export function orderProgress(order: AnyOrder): ProgressStep[] {
  const rank = statusRank(order);
  const hasFile = (Array.isArray(order.customerFiles) && order.customerFiles.length > 0) || Boolean(order.imageSrcUrl);
  const steps: ProgressStep[] = [];

  steps.push({ key: 'ontvangen', label: 'Opdracht ontvangen', done: true, who: order.assisted_by || undefined, when: order.createdAt });
  steps.push({
    key: 'bestand',
    label: 'Bestand van de klant binnen',
    done: hasFile,
    detail: hasFile ? undefined : 'Nog geen bestand: klant vragen te uploaden (QR-code op de bon)',
  });

  const approved = whoDidStatus(order, 'Preflight Goedgekeurd');
  steps.push({
    key: 'controle',
    label: 'Bestand gecontroleerd',
    done: rank >= 2,
    who: rank >= 2 ? approved.who : undefined,
    when: rank >= 2 ? approved.when : undefined,
    detail: order.status === 'Actie Vereist' ? 'Bestand niet in orde: klant benaderen' : rank < 2 ? 'Bestand controleren op resolutie en formaat' : undefined,
  });

  if (order.order_type === 'opdrachtbon' || order.payment_status) {
    const paid = order.payment_status === 'Volledig betaald';
    const payEntry = lastEntry(order, (item) => /betaald|aanbetaling/i.test(String(item?.note || '')));
    const open = Math.max(0, Number(order.remaining ?? order.grand_total ?? 0));
    steps.push({
      key: 'betaling',
      label: 'Betaling ontvangen',
      done: paid,
      who: paid ? payEntry?.by : undefined,
      when: paid ? payEntry?.date : undefined,
      detail: paid ? undefined : `Nog € ${open.toFixed(2).replace('.', ',')} open${Number(order.prepayment || 0) > 0 ? ' (aanbetaling is ontvangen)' : ''}`,
    });
  }

  const printed = whoDidStatus(order, 'In Druk');
  steps.push({ key: 'druk', label: 'Gedrukt', done: rank >= 3, who: rank >= 3 ? printed.who : undefined, when: rank >= 3 ? printed.when : undefined, detail: rank < 3 ? 'Nog in de druk zetten en afwerken (snijden, vouwen)' : undefined });

  const ready = whoDidStatus(order, 'Klaar voor Afhalen');
  steps.push({ key: 'klaar', label: 'Klaargezet', done: rank >= 4, who: rank >= 4 ? ready.who : undefined, when: rank >= 4 ? ready.when : undefined, detail: rank < 4 ? 'Nog klaarzetten en label erop' : undefined });

  const informed = lastEntry(order, (item) => /^Klant (gebeld|per e-mail ingelicht)/.test(String(item?.note || '')));
  steps.push({ key: 'klant', label: 'Klant ingelicht', done: Boolean(informed), who: informed?.by, when: informed?.date, detail: informed ? undefined : 'Klant bellen of mailen dat het klaarligt' });

  const handed = completedBy(order);
  steps.push({ key: 'afgehaald', label: 'Afgehaald / verzonden', done: rank >= 5, who: rank >= 5 ? handed.who : undefined, when: rank >= 5 ? handed.when : undefined });

  return steps;
}

export const helpRequestsOf = (order: AnyOrder): any[] => (Array.isArray(order.helpRequests) ? order.helpRequests : []);
export const openHelpFor = (order: AnyOrder, name: string) => helpRequestsOf(order).filter((item) => item.to === name && item.status === 'open');
