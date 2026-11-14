import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ClipboardList, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { PrintProduct } from '../types';

interface TicketStaff {
  id: string;
  name: string;
  role: string;
}

interface TicketLine {
  description: string;
  productId: string;
  category: string;
  width: string;
  height: string;
  printSides: 'single' | 'double';
  quantity: string;
  price: string;
}

interface OrderTicketWorkspaceProps {
  products: PrintProduct[];
  staff: TicketStaff[];
  onOrderCreated?: () => void;
  onViewOrders: () => void;
  publicAccess?: boolean;
}

interface CreatedTicket {
  id: string;
  trackingToken: string;
  data: Record<string, unknown>;
  productUploadLinks: Array<{
    id: string;
    uploadToken: string;
    description: string;
    quantity: number;
    widthMm: number;
    heightMm: number;
    printSides: 'single' | 'double';
  }>;
}

const ORDER_STATUSES = [
  'Nieuw',
  'Wacht op klantinformatie',
  'Wacht op betaling',
  'Wacht op goedkeuring',
  'In productie',
  'Gereed',
  'Afgeleverd/afgehaald',
  'Afgerond',
  'Geannuleerd',
];

const emptyLine = (product?: PrintProduct, quantity = '100'): TicketLine => ({
  description: product?.name ?? '',
  productId: product?.id ?? '',
  category: product?.category ?? '',
  width: String(product?.widthMm ?? 210),
  height: String(product?.heightMm ?? 297),
  printSides: 'single',
  quantity,
  price: '',
});

function parseAmount(value: string) {
  const normalized = value.trim().replace(/[€\s]/g, '');
  if (!normalized) return null;
  const decimal = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  if (!/^\d+(\.\d{1,2})?$/.test(decimal)) return Number.NaN;
  return Number(decimal);
}

function money(value: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

function newTicketNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `OB-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function TicketQr({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (active) setSource(dataUrl);
      })
      .catch(() => {
        if (active) setError('De QR-code kon niet worden gemaakt. Gebruik de trackinglink.');
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (error) return <p className="text-xs text-amber-700">{error}</p>;
  if (!source) return <div className="w-36 h-36 rounded-xl bg-slate-100 animate-pulse" aria-label="QR-code wordt gemaakt" />;
  return <img src={source} alt={`Uploadcode voor ${label}`} className="h-28 w-28 object-contain" />;
}

export default function OrderTicketWorkspace({ products, staff, onOrderCreated, onViewOrders, publicAccess = false }: OrderTicketWorkspaceProps) {
  const [ticketNumber, setTicketNumber] = useState(newTicketNumber);
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([emptyLine(products[0])]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'Afhalen' | 'Bezorgen'>('Afhalen');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [assignedStaff, setAssignedStaff] = useState('');
  const [status, setStatus] = useState('Nieuw');
  const [customerApproved, setCustomerApproved] = useState(false);
  const [prepayment, setPrepayment] = useState('0,00');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);

  const totals = useMemo(() => {
    let subtotal = 0;
    let incomplete = false;
    let invalid = false;
    let quantity = 0;
    let itemCount = 0;

    lines.forEach((line) => {
      const description = line.description.trim();
      const quantityText = line.quantity.trim();
      const priceText = line.price.trim();
      const filled = Boolean(description || priceText);
      const parsedQuantity = quantityText ? Number(quantityText) : null;
      const parsedPrice = parseAmount(priceText);
      const parsedWidth = Number(line.width);
      const parsedHeight = Number(line.height);
      if (filled && (!description || !quantityText || !priceText)) incomplete = true;
      if (filled && (
        parsedQuantity === null ||
        !Number.isInteger(parsedQuantity) ||
        parsedQuantity <= 0 ||
        parsedPrice === null ||
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 100000 ||
        !Number.isFinite(parsedWidth) ||
        parsedWidth <= 0 ||
        parsedWidth > 100000 ||
        !Number.isFinite(parsedHeight) ||
        parsedHeight <= 0 ||
        parsedHeight > 100000
      )) invalid = true;
      if (
        filled &&
        description &&
        parsedQuantity !== null &&
        Number.isInteger(parsedQuantity) &&
        parsedQuantity > 0 &&
        parsedPrice !== null &&
        Number.isFinite(parsedPrice) &&
        parsedPrice >= 0
      ) {
        subtotal += parsedQuantity * parsedPrice;
        quantity += parsedQuantity;
        itemCount += 1;
      }
    });

    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    if (quantity > 100000 || subtotal > 1000000000) invalid = true;
    const vat = Math.round((subtotal * 0.21 + Number.EPSILON) * 100) / 100;
    const total = Math.round((subtotal + vat + Number.EPSILON) * 100) / 100;
    const advance = parseAmount(prepayment);
    const remaining = advance !== null && Number.isFinite(advance)
      ? Math.max(0, Math.round((total - advance + Number.EPSILON) * 100) / 100)
      : total;
    const paymentStatus = advance !== null && advance >= total && total > 0
      ? 'Volledig betaald'
      : advance !== null && advance > 0
        ? 'Deels betaald'
        : 'Niet betaald';
    return { subtotal, vat, total, advance, remaining, paymentStatus, incomplete, invalid, quantity, itemCount };
  }, [lines, prepayment]);

  useEffect(() => {
    const clearPrintMode = () => document.body.classList.remove('job-ticket-printing');
    window.addEventListener('afterprint', clearPrintMode);
    return () => {
      clearPrintMode();
      window.removeEventListener('afterprint', clearPrintMode);
    };
  }, []);

  const trackingUrl = createdTicket
    ? `${window.location.origin}/klantportal?token=${encodeURIComponent(createdTicket.trackingToken)}`
    : '';

  const handleProductChange = (lineIndex: number, productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    setLines((current) => current.map((line, index) => index === lineIndex
      ? {
          ...line,
          productId: product.id,
          category: product.category,
          description: product.name,
          width: String(product.widthMm),
          height: String(product.heightMm),
          printSides: product.category === 'Sticker' ? 'single' : line.printSides,
        }
      : line));
  };

  const resetForm = () => {
    setTicketNumber(newTicketNumber());
    setCustomerName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setReference('');
    setLines([emptyLine(products[0])]);
    setDeliveryDate('');
    setDeliveryMethod('Afhalen');
    setDeliveryAddress('');
    setAssignedStaff('');
    setStatus('Nieuw');
    setCustomerApproved(false);
    setPrepayment('0,00');
    setNotes('');
    setInternalNotes('');
    setError('');
    setCreatedTicket(null);
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const validLines = lines
      .filter((line) => line.description.trim() || line.price.trim())
      .map((line) => ({
        description: line.description.trim(),
        productId: line.productId,
        category: line.category,
        widthMm: Number(line.width),
        heightMm: Number(line.height),
        printSides: line.category === 'Sticker' ? 'single' : line.printSides,
        quantity: Number(line.quantity),
        unitPrice: parseAmount(line.price) ?? Number.NaN,
      }));

    if (totals.incomplete || totals.invalid || validLines.length === 0) {
      setError('Vul iedere gebruikte productregel volledig en geldig in.');
      return;
    }
    if (totals.advance === null || !Number.isFinite(totals.advance) || totals.advance < 0 || totals.advance > totals.total) {
      setError('Vul een geldige aanbetaling in die niet hoger is dan het ordertotaal.');
      return;
    }
    if (deliveryMethod === 'Bezorgen' && !deliveryAddress.trim()) {
      setError('Vul het afleveradres in voor bezorging.');
      return;
    }

    const primaryLine = validLines[0];
    const payload = {
      clientName: customerName.trim(),
      clientEmail: email.trim(),
      clientPhone: phone.trim() || '-',
      clientReference: reference.trim(),
      clientQuantity: totals.quantity,
      selectedProductId: primaryLine.productId,
      selectedProductName: primaryLine.description,
      selectedProductCategory: primaryLine.category,
      customWidth: primaryLine.widthMm,
      customHeight: primaryLine.heightMm,
      printSides: primaryLine.printSides,
      clientComments: notes,
      assignedStaff: publicAccess ? '' : assignedStaff,
      status: 'Ingediend',
      order_type: 'opdrachtbon',
      order_number: ticketNumber,
      contact_person: contactPerson.trim(),
      delivery_date: deliveryDate,
      delivery_method: deliveryMethod,
      delivery_address: deliveryMethod === 'Bezorgen' ? deliveryAddress.trim() : '',
      assisted_by: publicAccess ? '' : assignedStaff,
      order_status: publicAccess ? 'Nieuw' : status,
      payment_status: publicAccess ? 'Niet betaald' : totals.paymentStatus,
      products_json: JSON.stringify(validLines),
      subtotal: totals.subtotal,
      vat: totals.vat,
      grand_total: totals.total,
      prepayment: publicAccess ? 0 : totals.advance,
      remaining: publicAccess ? totals.total : totals.remaining,
      customer_approved: publicAccess ? false : customerApproved,
      notes: notes.trim(),
      internal_notes: publicAccess ? '' : internalNotes.trim(),
    };

    setIsSaving(true);
    try {
      const response = await fetch(publicAccess ? '/api/orders' : '/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderData: payload }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'De opdrachtbon kon niet worden opgeslagen.');
        return;
      }
      setCreatedTicket({
        id: result.orderId,
        trackingToken: result.trackingToken,
        data: payload,
        productUploadLinks: Array.isArray(result.productUploadLinks) ? result.productUploadLinks : [],
      });
      onOrderCreated?.();
    } catch (requestError) {
      console.error('Fout bij opslaan opdrachtbon:', requestError);
      setError('Er kon geen verbinding worden gemaakt met het ordersysteem. Probeer het opnieuw.');
    } finally {
      setIsSaving(false);
    }
  };

  const printTicket = () => {
    document.body.classList.add('job-ticket-printing');
    window.print();
  };

  const emailTicket = () => {
    if (!createdTicket) return;
    const linesForEmail = JSON.parse(String(createdTicket.data.products_json)) as Array<{
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
    const emailBody = [
      `Beste ${String(createdTicket.data.contact_person || createdTicket.data.clientName)},`,
      '',
      `Hierbij de gegevens van opdrachtbon ${String(createdTicket.data.order_number)}.`,
      '',
      ...linesForEmail.flatMap((line, index) => {
        const upload = createdTicket.productUploadLinks[index];
        const uploadUrl = upload
          ? `${window.location.origin}/klantportal?token=${encodeURIComponent(upload.uploadToken)}`
          : '';
        return [
          `${line.quantity}x ${line.description} — ${money(Number(line.unitPrice) * line.quantity)}`,
          ...(uploadUrl ? [`Upload bestanden voor dit product: ${uploadUrl}`] : []),
        ];
      }),
      '',
      `Totaal incl. btw: ${money(Number(createdTicket.data.grand_total))}`,
      `Aanbetaling: ${money(Number(createdTicket.data.prepayment))}`,
      `Openstaand: ${money(Number(createdTicket.data.remaining))}`,
      '',
      `Volg de status van uw opdracht via: ${trackingUrl}`,
    ].join('\n');
    window.location.href = `mailto:${encodeURIComponent(String(createdTicket.data.clientEmail))}?subject=${encodeURIComponent(`Opdrachtbon ${createdTicket.data.order_number} · FD Printing Center`)}&body=${encodeURIComponent(emailBody)}`;
  };

  if (createdTicket) {
    const ticketData = createdTicket.data;
    const orderLines = JSON.parse(String(ticketData.products_json)) as Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      widthMm?: number;
      heightMm?: number;
      printSides?: 'single' | 'double';
    }>;
    return (
      <div className="space-y-5 animate-fade-in font-sans">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Opdrachtbon aangemaakt</h3>
            <p className="mt-1 text-xs text-slate-500">De bon staat in het ordersysteem. Iedere productregel heeft een eigen QR-code en uploadlink.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={emailTicket} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800">
              <Send className="h-4 w-4" /> Mail naar klant
            </button>
            <button type="button" onClick={printTicket} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
              <Printer className="h-4 w-4" /> Printen / PDF
            </button>
          </div>
        </div>

        <article className="job-ticket-document overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-4 bg-rose-700 p-6 text-white sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-rose-100">FD Printing Center</p>
              <h2 className="mt-1 text-2xl font-extrabold">Opdrachtbon</h2>
              <p className="mt-1 text-sm text-rose-100">Professionele print- &amp; drukwerkservice</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-bold">{String(ticketData.order_number)}</p>
              <p className="mt-1 text-xs text-rose-100">{new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' }).format(new Date())}</p>
            </div>
          </header>

          <div className="p-5 sm:p-8">
            <div className="space-y-6">
              <section className="grid gap-5 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Klantgegevens</h3>
                  <p className="font-bold text-slate-900">{String(ticketData.clientName)}</p>
                  {ticketData.contact_person ? <p className="text-sm text-slate-600">{String(ticketData.contact_person)}</p> : null}
                  <p className="text-sm text-slate-600">{String(ticketData.clientEmail)}</p>
                  <p className="text-sm text-slate-600">{String(ticketData.clientPhone)}</p>
                  {ticketData.clientReference ? <p className="mt-1 text-xs text-slate-500">Referentie: {String(ticketData.clientReference)}</p> : null}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Opdrachtgegevens</h3>
                  <p className="text-sm text-slate-700">Status: <strong>{String(ticketData.order_status)}</strong></p>
                  <p className="text-sm text-slate-700">Levering: {String(ticketData.delivery_method)}{ticketData.delivery_date ? ` · ${String(ticketData.delivery_date)}` : ''}</p>
                  {ticketData.delivery_address ? <p className="text-sm text-slate-700">{String(ticketData.delivery_address)}</p> : null}
                  {ticketData.assignedStaff ? <p className="text-sm text-slate-700">Operator: {String(ticketData.assignedStaff)}</p> : null}
                  <p className="text-sm text-slate-700">Klantakkoord: {ticketData.customer_approved ? 'Ontvangen' : 'Nog niet ontvangen'}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Productregels</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="p-3">Omschrijving</th><th className="p-3">Specificaties</th><th className="p-3 text-right">Aantal</th><th className="p-3 text-right">Prijs/stuk</th><th className="p-3 text-right">Totaal</th></tr>
                    </thead>
                    <tbody>
                      {orderLines.map((line, index) => (
                        <tr key={`${line.description}-${index}`} className="border-t border-slate-100">
                          <td className="p-3 font-medium text-slate-800">{line.description}</td>
                          <td className="p-3 text-xs text-slate-600">
                            {String(line.widthMm ?? ticketData.customWidth)} × {String(line.heightMm ?? ticketData.customHeight)} mm · {(line.printSides ?? ticketData.printSides) === 'double' ? 'Dubbelzijdig' : 'Enkelzijdig'}
                          </td>
                          <td className="p-3 text-right">{line.quantity}</td>
                          <td className="p-3 text-right">{money(line.unitPrice)}</td>
                          <td className="p-3 text-right font-semibold">{money(line.unitPrice * line.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Uploadcodes per product</h3>
                  <p className="mt-1 text-xs text-slate-500">Iedere QR-code en link is gekoppeld aan één product. Bestanden die via de code worden aangeleverd, verschijnen bij dat product in het backoffice.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {orderLines.map((line, index) => {
                    const upload = createdTicket.productUploadLinks[index];
                    if (!upload) return null;
                    const uploadUrl = `${window.location.origin}/klantportal?token=${encodeURIComponent(upload.uploadToken)}`;
                    return (
                      <article key={upload.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <TicketQr value={uploadUrl} label={line.description} />
                        <div className="min-w-0 space-y-1">
                          <h4 className="break-words text-xs font-extrabold text-slate-900">{line.description}</h4>
                          <p className="text-[10px] text-slate-500">{line.quantity} stuks · {String(line.widthMm ?? ticketData.customWidth)} × {String(line.heightMm ?? ticketData.customHeight)} mm</p>
                          <a className="block break-all text-[10px] font-semibold text-blue-700 underline" href={uploadUrl}>{uploadUrl}</a>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {createdTicket.productUploadLinks.length !== orderLines.length && (
                  <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    Niet voor ieder product is een uploadcode aangemaakt. Neem contact op met de beheerder voordat u de bon deelt.
                  </p>
                )}
              </section>
              {ticketData.notes ? <p className="whitespace-pre-wrap text-sm text-slate-600"><strong>Opmerkingen:</strong> {String(ticketData.notes)}</p> : null}
              {ticketData.internal_notes ? <p className="no-print whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><strong>Interne notitie:</strong> {String(ticketData.internal_notes)}</p> : null}
            </div>
            <div className="mt-6 ml-auto max-w-sm border-t border-slate-200 pt-4 text-right text-xs text-slate-600">
              <p>Subtotaal: <strong>{money(Number(ticketData.subtotal))}</strong></p>
              <p className="mt-1">BTW (21%): <strong>{money(Number(ticketData.vat))}</strong></p>
              <p className="mt-2 text-base text-slate-900">Totaal incl. btw: <strong>{money(Number(ticketData.grand_total))}</strong></p>
              <p className="mt-1">Aanbetaling: {money(Number(ticketData.prepayment))} · Openstaand: {money(Number(ticketData.remaining))}</p>
              <p className="mt-1">{String(ticketData.payment_status)}</p>
            </div>
          </div>
        </article>

        <div className="no-print flex flex-wrap gap-3">
          <button type="button" onClick={resetForm} className="rounded-lg bg-rose-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-800">
            Nieuwe opdrachtbon
          </button>
          <button type="button" onClick={onViewOrders} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {publicAccess ? 'Terug naar startpagina' : 'Naar orders overzicht'}
          </button>
        </div>
        <style>{`
          @media print {
            body.job-ticket-printing * { visibility: hidden !important; }
            body.job-ticket-printing .job-ticket-document,
            body.job-ticket-printing .job-ticket-document * { visibility: visible !important; }
            body.job-ticket-printing .job-ticket-document { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; }
            body.job-ticket-printing .no-print { display: none !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-rose-700">
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {publicAccess ? 'FD Printing Center / Opdrachtbon' : 'FD Printing Center / Backoffice'}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">Nieuwe opdrachtbon</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            {publicAccess
              ? 'Leg een klantopdracht vast. Na opslaan verschijnt deze direct in het backoffice ordersysteem en krijgt de klant een trackinglink.'
              : 'Leg een klantopdracht vast. Na opslaan verschijnt deze direct in het ordersysteem en krijgt de klant een trackinglink voor de status en het aanleveren van bestanden.'}
          </p>
          <p className="mt-3 inline-flex rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold text-slate-700">
            Bonnummer: {ticketNumber}
          </p>
        </div>

        {error && <p role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</p>}

        <form onSubmit={submitOrder} className="space-y-6 text-xs">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-extrabold text-slate-800">1. Klant- en contactgegevens</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Klant- of bedrijfsnaam *</span>
                  <input required maxLength={200} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Bijv. Janssen Marketing BV" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Contactpersoon</span>
                  <input maxLength={200} value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Telefoonnummer</span>
                  <input type="tel" maxLength={100} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+31 6 12345678" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">E-mailadres klant *</span>
                  <input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="info@bedrijf.nl" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Referentiecode</span>
                  <input maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bijv. REF-2026-A" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-800">2. Producten, specificaties &amp; kosten</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Vul per product de specificaties, oplage en prijs in.</p>
                </div>
                <button type="button" onClick={() => setLines((current) => [...current, emptyLine(products[0], '1')])} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 hover:bg-slate-100">
                  <Plus className="h-3.5 w-3.5" /> Product toevoegen
                </button>
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <article key={index} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-extrabold text-slate-800">Product {index + 1}</h4>
                      <button type="button" aria-label={`Product ${index + 1} verwijderen`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Preset product</span>
                        <select value={line.productId} onChange={(event) => handleProductChange(index, event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Productnaam</span>
                        <input required maxLength={2000} value={line.description} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, description: event.target.value } : entry))} placeholder="Product / omschrijving" className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Breedte (mm)</span>
                        <input type="number" min="1" max="100000" required value={line.width} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, width: event.target.value } : entry))} className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Hoogte (mm)</span>
                        <input type="number" min="1" max="100000" required value={line.height} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, height: event.target.value } : entry))} className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Zijdigheid</span>
                        <select disabled={line.category === 'Sticker'} value={line.category === 'Sticker' ? 'single' : line.printSides} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, printSides: event.target.value as 'single' | 'double' } : entry))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 disabled:bg-slate-100">
                          <option value="single">Enkelzijdig</option>
                          <option value="double">Dubbelzijdig</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Aantal</span>
                        <input type="number" min="1" max="100000" step="1" required value={line.quantity} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">Prijs per stuk (€)</span>
                        <input required inputMode="decimal" value={line.price} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, price: event.target.value } : entry))} placeholder="0,00" className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
              {!publicAccess && (
                <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Orderstatus</span>
                    <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                      {ORDER_STATUSES.map((orderStatus) => <option key={orderStatus}>{orderStatus}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Operator toewijzen</span>
                    <select value={assignedStaff} onChange={(event) => setAssignedStaff(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                      <option value="">Geen operator toegewezen</option>
                      {staff.map((member) => <option key={member.id} value={member.name}>{member.name} ({member.role})</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                {!publicAccess && (
                  <>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">Aanbetaling (€)</span>
                      <input inputMode="decimal" value={prepayment} onChange={(event) => setPrepayment(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                    </label>
                    <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white p-3">
                      <input type="checkbox" checked={customerApproved} onChange={(event) => setCustomerApproved(event.target.checked)} className="h-4 w-4 accent-rose-700" />
                      <span className="font-medium text-slate-700">Klantakkoord ontvangen</span>
                    </label>
                  </>
                )}
                <div className="space-y-1 text-right text-xs text-slate-600 sm:col-span-2">
                  <p>Subtotaal: <strong>{money(totals.subtotal)}</strong></p>
                  <p>BTW (21%): <strong>{money(totals.vat)}</strong></p>
                  <p className="text-base text-slate-900">Totaal incl. btw: <strong>{money(totals.total)}</strong></p>
                  <p>Aanbetaling: <strong>{money(totals.advance ?? 0)}</strong> · Openstaand: <strong>{money(totals.remaining)}</strong> · {totals.paymentStatus}</p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-extrabold text-slate-800">3. Levering</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Gewenste leverdatum</span>
                  <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Levermethode</span>
                  <select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as 'Afhalen' | 'Bezorgen')} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                    <option>Afhalen</option>
                    <option>Bezorgen</option>
                  </select>
                </label>
                {deliveryMethod === 'Bezorgen' && (
                  <label className="space-y-1 sm:col-span-2">
                    <span className="block text-[10px] font-bold uppercase text-slate-500">Afleveradres *</span>
                    <input required maxLength={1000} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                  </label>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-extrabold text-slate-800">4. Opmerkingen</h3>
              <label className="block space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Opmerking voor de klant</span>
                <textarea maxLength={2000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Aanvullende informatie voor de klant" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
              </label>
              {!publicAccess && (
                <label className="block space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Interne opmerkingen</span>
                  <textarea maxLength={2000} rows={3} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Bijvoorbeeld: sneldruk gewenst." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <p className="text-[11px] text-slate-500">De opdracht wordt opgeslagen in het ordersysteem en krijgt een klantvriendelijke trackinglink.</p>
            <button type="submit" disabled={isSaving || totals.itemCount === 0} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
              <ClipboardList className="h-4 w-4 text-emerald-400" /> {isSaving ? 'Opdrachtbon opslaan…' : 'Opdrachtbon aanmaken'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
