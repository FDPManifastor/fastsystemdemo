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
  quantity: string;
  price: string;
}

interface OrderTicketWorkspaceProps {
  products: PrintProduct[];
  staff: TicketStaff[];
  onOrderCreated: () => void;
  onViewOrders: () => void;
}

interface CreatedTicket {
  id: string;
  trackingToken: string;
  data: Record<string, unknown>;
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

const emptyLine = (description = ''): TicketLine => ({
  description,
  quantity: '100',
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

function TicketQr({ value }: { value: string }) {
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
  return <img src={source} alt="QR-code voor ordertracking" className="w-36 h-36 object-contain" />;
}

export default function OrderTicketWorkspace({ products, staff, onOrderCreated, onViewOrders }: OrderTicketWorkspaceProps) {
  const [ticketNumber, setTicketNumber] = useState(newTicketNumber);
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(products[0]);
  const [width, setWidth] = useState(products[0]?.widthMm ?? 210);
  const [height, setHeight] = useState(products[0]?.heightMm ?? 297);
  const [printSides, setPrintSides] = useState<'single' | 'double'>('single');
  const [lines, setLines] = useState<TicketLine[]>([emptyLine(products[0]?.name ?? '')]);
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
      if (filled && (!description || !quantityText || !priceText)) incomplete = true;
      if (filled && (
        parsedQuantity === null ||
        !Number.isInteger(parsedQuantity) ||
        parsedQuantity <= 0 ||
        parsedPrice === null ||
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 100000
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
    ? `${window.location.origin}/?token=${encodeURIComponent(createdTicket.trackingToken)}`
    : '';

  const handleProductChange = (productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    setSelectedProduct(product);
    setWidth(product.widthMm);
    setHeight(product.heightMm);
    setLines((current) => current.map((line, index) => (
      index === 0 && (!line.description || products.some((entry) => entry.name === line.description))
        ? { ...line, description: product.name }
        : line
    )));
    if (product.category === 'Sticker') setPrintSides('single');
  };

  const resetForm = () => {
    const defaultProduct = products[0];
    setTicketNumber(newTicketNumber());
    setCustomerName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setReference('');
    setSelectedProduct(defaultProduct);
    setWidth(defaultProduct?.widthMm ?? 210);
    setHeight(defaultProduct?.heightMm ?? 297);
    setPrintSides('single');
    setLines([emptyLine(defaultProduct?.name ?? '')]);
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
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      setError('Vul een geldige breedte en hoogte in.');
      return;
    }
    if (deliveryMethod === 'Bezorgen' && !deliveryAddress.trim()) {
      setError('Vul het afleveradres in voor bezorging.');
      return;
    }

    const payload = {
      clientName: customerName.trim(),
      clientEmail: email.trim(),
      clientPhone: phone.trim() || '-',
      clientReference: reference.trim(),
      clientQuantity: totals.quantity,
      selectedProductId: selectedProduct.id,
      selectedProductName: selectedProduct.name,
      selectedProductCategory: selectedProduct.category,
      customWidth: Number(width),
      customHeight: Number(height),
      printSides,
      clientComments: notes,
      assignedStaff,
      status: 'Ingediend',
      order_type: 'opdrachtbon',
      order_number: ticketNumber,
      contact_person: contactPerson.trim(),
      delivery_date: deliveryDate,
      delivery_method: deliveryMethod,
      delivery_address: deliveryMethod === 'Bezorgen' ? deliveryAddress.trim() : '',
      assisted_by: assignedStaff,
      order_status: status,
      payment_status: totals.paymentStatus,
      products_json: JSON.stringify(validLines),
      subtotal: totals.subtotal,
      vat: totals.vat,
      grand_total: totals.total,
      prepayment: totals.advance,
      remaining: totals.remaining,
      customer_approved: customerApproved,
      notes: notes.trim(),
      internal_notes: internalNotes.trim(),
    };

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/orders', {
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
      });
      onOrderCreated();
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
      ...linesForEmail.map((line) => `${line.quantity}x ${line.description} — ${money(Number(line.unitPrice) * line.quantity)}`),
      '',
      `Totaal incl. btw: ${money(Number(createdTicket.data.grand_total))}`,
      `Aanbetaling: ${money(Number(createdTicket.data.prepayment))}`,
      `Openstaand: ${money(Number(createdTicket.data.remaining))}`,
      '',
      `Volg uw opdracht via: ${trackingUrl}`,
    ].join('\n');
    window.location.href = `mailto:${encodeURIComponent(String(createdTicket.data.clientEmail))}?subject=${encodeURIComponent(`Opdrachtbon ${createdTicket.data.order_number} · FD Printing Center`)}&body=${encodeURIComponent(emailBody)}`;
  };

  if (createdTicket) {
    const ticketData = createdTicket.data;
    const orderLines = JSON.parse(String(ticketData.products_json)) as Array<{ description: string; quantity: number; unitPrice: number }>;
    return (
      <div className="space-y-5 animate-fade-in font-sans">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Opdrachtbon aangemaakt</h3>
            <p className="mt-1 text-xs text-slate-500">De bon staat nu in het ordersysteem en kan met de klant worden gedeeld.</p>
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

          <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:p-8">
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
                  <p className="text-sm text-slate-700">{String(ticketData.customWidth)} × {String(ticketData.customHeight)} mm · {ticketData.printSides === 'double' ? 'Dubbelzijdig' : 'Enkelzijdig'}</p>
                  {ticketData.assignedStaff ? <p className="text-sm text-slate-700">Operator: {String(ticketData.assignedStaff)}</p> : null}
                  <p className="text-sm text-slate-700">Klantakkoord: {ticketData.customer_approved ? 'Ontvangen' : 'Nog niet ontvangen'}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Productregels</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[440px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="p-3">Omschrijving</th><th className="p-3 text-right">Aantal</th><th className="p-3 text-right">Prijs</th><th className="p-3 text-right">Totaal</th></tr>
                    </thead>
                    <tbody>
                      {orderLines.map((line, index) => (
                        <tr key={`${line.description}-${index}`} className="border-t border-slate-100">
                          <td className="p-3 font-medium text-slate-800">{line.description}</td>
                          <td className="p-3 text-right">{line.quantity}</td>
                          <td className="p-3 text-right">{money(line.unitPrice)}</td>
                          <td className="p-3 text-right font-semibold">{money(line.unitPrice * line.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {ticketData.notes ? <p className="whitespace-pre-wrap text-sm text-slate-600"><strong>Opmerkingen:</strong> {String(ticketData.notes)}</p> : null}
              {ticketData.internal_notes ? <p className="no-print whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><strong>Interne notitie:</strong> {String(ticketData.internal_notes)}</p> : null}
            </div>

            <aside className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Live tracking</span>
              <TicketQr value={trackingUrl} />
              <a className="max-w-56 break-all text-xs text-blue-700 underline" href={trackingUrl}>{trackingUrl}</a>
              <div className="w-full border-t border-slate-100 pt-3 text-left text-xs text-slate-600">
                <p className="flex justify-between gap-6"><span>Subtotaal</span><span>{money(Number(ticketData.subtotal))}</span></p>
                <p className="mt-1 flex justify-between gap-6"><span>BTW (21%)</span><span>{money(Number(ticketData.vat))}</span></p>
                <p className="mt-2 flex justify-between gap-6 border-t border-slate-100 pt-2 font-bold text-slate-900"><span>Totaal incl. btw</span><span>{money(Number(ticketData.grand_total))}</span></p>
                <p className="mt-1 flex justify-between gap-6"><span>Aanbetaling</span><span>{money(Number(ticketData.prepayment))}</span></p>
                <p className="mt-1 flex justify-between gap-6 font-bold"><span>Openstaand</span><span>{money(Number(ticketData.remaining))}</span></p>
                <p className="mt-2 text-right">{String(ticketData.payment_status)}</p>
              </div>
            </aside>
          </div>
        </article>

        <div className="no-print flex flex-wrap gap-3">
          <button type="button" onClick={resetForm} className="rounded-lg bg-rose-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-800">
            Nieuwe opdrachtbon
          </button>
          <button type="button" onClick={onViewOrders} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Naar orders overzicht
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
            <span className="text-[10px] font-bold uppercase tracking-widest">FD Printing Center / Backoffice</span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">Nieuwe opdrachtbon</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Leg een klantopdracht vast. Na opslaan verschijnt deze direct in het ordersysteem en krijgt de klant een trackinglink voor de status en het aanleveren van bestanden.
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

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-extrabold text-slate-800">2. Drukwerkformaat en specificaties</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Preset product</span>
                  <select value={selectedProduct.id} onChange={(event) => handleProductChange(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Productnaam</span>
                  <input readOnly value={selectedProduct.name} className="w-full rounded-lg border border-slate-200 bg-slate-100 p-2.5 text-xs text-slate-600" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Breedte (mm)</span>
                  <input type="number" min="1" max="100000" required value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Hoogte (mm)</span>
                  <input type="number" min="1" max="100000" required value={height} onChange={(event) => setHeight(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Zijdigheid</span>
                  <select disabled={selectedProduct.category === 'Sticker'} value={selectedProduct.category === 'Sticker' ? 'single' : printSides} onChange={(event) => setPrintSides(event.target.value as 'single' | 'double')} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 disabled:bg-slate-100">
                    <option value="single">Enkelzijdig</option>
                    <option value="double">Dubbelzijdig</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Orderstatus</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                    {ORDER_STATUSES.map((orderStatus) => <option key={orderStatus}>{orderStatus}</option>)}
                  </select>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Operator toewijzen</span>
                  <select value={assignedStaff} onChange={(event) => setAssignedStaff(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800">
                    <option value="">Geen operator toegewezen</option>
                    {staff.map((member) => <option key={member.id} value={member.name}>{member.name} ({member.role})</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-extrabold text-slate-800">3. Productregels en kosten</h3>
                <button type="button" onClick={() => setLines((current) => [...current, { description: '', quantity: '1', price: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 hover:bg-slate-100">
                  <Plus className="h-3.5 w-3.5" /> Productregel toevoegen
                </button>
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_110px_150px_40px] sm:items-end">
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">Omschrijving</span>
                      <input maxLength={2000} value={line.description} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, description: event.target.value } : entry))} placeholder="Product / omschrijving" className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">Aantal</span>
                      <input type="number" min="1" max="100000" step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">Prijs per stuk (€)</span>
                      <input inputMode="decimal" value={line.price} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, price: event.target.value } : entry))} placeholder="0,00" className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800" />
                    </label>
                    <button type="button" aria-label={`Productregel ${index + 1} verwijderen`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))} className="flex h-9 items-center justify-center rounded-lg border border-slate-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Aanbetaling (€)</span>
                  <input inputMode="decimal" value={prepayment} onChange={(event) => setPrepayment(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white p-3">
                  <input type="checkbox" checked={customerApproved} onChange={(event) => setCustomerApproved(event.target.checked)} className="h-4 w-4 accent-rose-700" />
                  <span className="font-medium text-slate-700">Klantakkoord ontvangen</span>
                </label>
                <div className="space-y-1 text-right text-xs text-slate-600 sm:col-span-2">
                  <p>Subtotaal: <strong>{money(totals.subtotal)}</strong></p>
                  <p>BTW (21%): <strong>{money(totals.vat)}</strong></p>
                  <p className="text-base text-slate-900">Totaal incl. btw: <strong>{money(totals.total)}</strong></p>
                  <p>Aanbetaling: <strong>{money(totals.advance ?? 0)}</strong> · Openstaand: <strong>{money(totals.remaining)}</strong> · {totals.paymentStatus}</p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-extrabold text-slate-800">4. Levering</h3>
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
              <h3 className="font-extrabold text-slate-800">5. Opmerkingen</h3>
              <label className="block space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Opmerking voor de klant</span>
                <textarea maxLength={2000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Aanvullende informatie voor de klant" className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
              </label>
              <label className="block space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Interne opmerkingen</span>
                <textarea maxLength={2000} rows={3} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Bijvoorbeeld: sneldruk gewenst." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800" />
              </label>
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
