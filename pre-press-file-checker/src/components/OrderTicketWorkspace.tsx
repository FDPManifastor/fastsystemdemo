import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Calculator, Eraser, Paperclip, Plus, Printer, Save, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { PrintProduct } from '../types';
import { FDLogo } from './FDLogo';
import type { CatalogProduct } from '../utils/pricing';
import {
  CalculatorApplied,
  FileThumb,
  MAX_UPLOAD_BYTES,
  PriceCalculatorPanel,
  ProductSearchInput,
  TicketPrepressModal,
  getUploadFileType,
  readFileAsDataUrl,
  useCatalog,
} from './ticket/TicketTools';

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
  vatIncluded: boolean;
  /** Vast regeltotaal incl. btw (uit de calculator); null = aantal × prijs per stuk. */
  fixedTotal: number | null;
  sku: string;
  priceSource: string;
  file: File | null;
  prepressNote: string;
}

interface TicketFileStatus {
  id: string;
  fileName: string;
  fileType: string;
}

interface SavedLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatIncluded?: boolean;
  fixedTotal?: number;
  widthMm?: number;
  heightMm?: number;
  printSides?: 'single' | 'double';
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
  createdAt: string;
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

const VAT_RATE = 0.21;

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

const COMPANY_FOOTER = [
  'Bijlmerplein 100 | 1102 DA Amsterdam | Tel : 020 - 363 1445',
  'www.fdprintingcenter.nl | amsterdam@fdprintingcenter.nl',
  'Facebook.com/fdprinting',
  'K.v.K. 302.730.16 | BTW 821452502B01',
];

const emptyLine = (product?: PrintProduct, quantity = '1'): TicketLine => ({
  description: product?.name ?? '',
  productId: product?.id ?? '',
  category: product?.category ?? '',
  width: String(product?.widthMm ?? 210),
  height: String(product?.heightMm ?? 297),
  printSides: 'single',
  quantity,
  price: '',
  vatIncluded: true,
  fixedTotal: null,
  sku: '',
  priceSource: '',
  file: null,
  prepressNote: '',
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

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function money(value: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

/** Regeltotaal inclusief btw, ongeacht of de stukprijs incl. of excl. btw is ingevoerd. */
function lineTotalIncl(quantity: number, unitPrice: number, vatIncluded?: boolean, fixedTotal?: number | null) {
  if (typeof fixedTotal === 'number') return fixedTotal;
  const gross = quantity * unitPrice;
  return vatIncluded ? gross : gross * (1 + VAT_RATE);
}

function formatDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatIsoDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
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
        if (active) setError('De QR-code kon niet worden gemaakt. Gebruik de uploadlink.');
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (error) return <p className="text-xs text-amber-700">{error}</p>;
  if (!source) return <div className="h-24 w-24 animate-pulse rounded-lg bg-slate-100" aria-label="QR-code wordt gemaakt" />;
  return <img src={source} alt={`Uploadcode voor ${label}`} className="h-24 w-24 object-contain" />;
}

/* ------------------------------------------------------------------ */
/* Bouwstenen van het bonformulier (gedeeld door invoer en weergave)   */
/* ------------------------------------------------------------------ */

const lineInput =
  'w-full min-w-0 border-0 border-b border-slate-300 bg-transparent px-1 py-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-[#e31c24] focus:outline-none focus:ring-0';
const boxInput =
  'w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]';

function FieldRow({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-end gap-2 py-1">
      <label htmlFor={htmlFor} className="pb-1 text-sm font-bold text-slate-900">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="min-h-[1.75rem] break-words border-b border-slate-200 px-1 py-1 text-sm text-slate-900">{children || ' '}</p>;
}

function SheetLogo({ date }: { date: string }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <FDLogo iconOnly className="[&>div]:h-14 [&>div]:w-14" />
        <div className="flex items-baseline">
          <span className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Printing Center</span>
          <span className="ml-0.5 text-lg font-black text-[#e31c24]">.NL</span>
        </div>
      </div>
      <p className="text-xl font-medium tabular-nums text-slate-900">{date}</p>
    </div>
  );
}

function SheetFooter() {
  return (
    <footer className="mt-6 border-y border-slate-400 py-3 text-center text-sm font-semibold leading-snug text-slate-900">
      {COMPANY_FOOTER.map((line) => <p key={line}>{line}</p>)}
    </footer>
  );
}

function TotalsBlock({ subtotal, vat, total }: { subtotal: number; vat: number; total: number }) {
  return (
    <dl className="space-y-1.5 text-base">
      {[
        ['Subtotaal', subtotal],
        ['BTW 21%', vat],
        ['Totaal', total],
      ].map(([label, value]) => (
        <div key={String(label)} className={`grid grid-cols-[6.5rem_1fr] items-baseline gap-3 rounded px-2 py-1 ${label === 'Totaal' ? 'bg-slate-100 font-extrabold' : 'bg-slate-50'}`}>
          <dt className="font-bold text-slate-900">{label}</dt>
          <dd className="text-right tabular-nums text-slate-900">{money(Number(value))}</dd>
        </div>
      ))}
    </dl>
  );
}

function PaymentBox({ title, checked, shaded, onToggle, disabled, children }: { title: string; checked: boolean; shaded?: boolean; onToggle?: (next: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  const interactive = Boolean(onToggle);
  return (
    <div className={`flex min-h-[8.5rem] flex-col gap-2 p-3 ${shaded ? 'bg-slate-100' : ''}`}>
      {interactive ? (
        <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onToggle!(event.target.checked)}
            className="h-5 w-5 shrink-0 cursor-[inherit] accent-[#e31c24]"
          />
          <span className="text-sm font-bold text-slate-900">{title}</span>
        </label>
      ) : (
        <div className="flex items-center gap-2">
          <span aria-hidden className={`flex h-5 w-5 items-center justify-center border-2 border-slate-800 text-xs font-black ${checked ? 'bg-slate-900 text-white' : 'bg-white'}`}>
            {checked ? '✓' : ''}
          </span>
          <span className="text-sm font-bold text-slate-900">{title}</span>
        </div>
      )}
      {children}
      <p className="mt-auto text-xs text-slate-600">Handtekening voldaan:</p>
      <div className="h-6 border-b border-dashed border-slate-300" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoofdcomponent                                                      */
/* ------------------------------------------------------------------ */

export default function OrderTicketWorkspace({ products, staff, onOrderCreated, onViewOrders, publicAccess = false }: OrderTicketWorkspaceProps) {
  const [ticketNumber, setTicketNumber] = useState(newTicketNumber);
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [postcodeCity, setPostcodeCity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([emptyLine(products[0])]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'Afhalen' | 'Bezorgen'>('Afhalen');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [assignedStaff, setAssignedStaff] = useState('');
  const [helpedBy, setHelpedBy] = useState('');
  const [status, setStatus] = useState('Nieuw');
  const [customerApproved, setCustomerApproved] = useState(false);
  const [prepayment, setPrepayment] = useState('0,00');
  const [paidInAdvance, setPaidInAdvance] = useState(false);
  const [depositOn, setDepositOn] = useState(false);
  const [restPaid, setRestPaid] = useState(false);
  const depositInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);
  const [calculatorIndex, setCalculatorIndex] = useState<number | null>(null);
  const [prepressIndex, setPrepressIndex] = useState<number | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<number, 'uploading' | 'done' | 'error'>>({});
  const [receivedFiles, setReceivedFiles] = useState<Record<string, TicketFileStatus[]>>({});
  const catalog = useCatalog();
  const today = useMemo(() => formatDate(new Date()), []);

  const updateLine = (lineIndex: number, changes: Partial<TicketLine>) => {
    // Wie aantal, prijs, btw of formaat met de hand wijzigt, laat een eerder berekend vast totaal los.
    const manualPriceEdit = !('fixedTotal' in changes) && ['quantity', 'price', 'vatIncluded', 'width', 'height'].some((key) => key in changes);
    setLines((current) => current.map((line, index) => (index === lineIndex
      ? { ...line, ...changes, ...(manualPriceEdit && line.fixedTotal !== null ? { fixedTotal: null, priceSource: '' } : {}) }
      : line)));
  };

  const pickCatalogProduct = (lineIndex: number, product: CatalogProduct) => {
    updateLine(lineIndex, {
      description: product.name,
      quantity: '1',
      price: product.price > 0 ? product.price.toFixed(2).replace('.', ',') : '',
      vatIncluded: true,
      fixedTotal: null,
      sku: product.sku,
      priceSource: product.price > 0 ? `FDPBRAIN${product.sku ? ` · SKU ${product.sku}` : ''}` : '',
    });
  };

  const applyCalculator = (lineIndex: number, applied: CalculatorApplied) => {
    updateLine(lineIndex, {
      description: applied.result.description,
      productId: '',
      category: applied.kind === 'sticker' ? 'Sticker' : 'Banner',
      width: String(applied.widthMm),
      height: String(applied.heightMm),
      printSides: 'single',
      quantity: String(applied.quantity),
      price: (applied.result.total / applied.quantity).toFixed(2).replace('.', ','),
      vatIncluded: true,
      fixedTotal: applied.result.total,
      sku: '',
      priceSource: applied.result.source,
    });
    setCalculatorIndex(null);
  };

  const chooseFile = (lineIndex: number, file: File | null) => {
    setError('');
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError('Bestanden mogen maximaal 4 MB groot zijn.');
      return;
    }
    if (file && !getUploadFileType(file)) {
      setError('Kies een PDF-, PNG- of JPG-bestand.');
      return;
    }
    updateLine(lineIndex, { file, prepressNote: '' });
    if (file) setPrepressIndex(lineIndex);
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let total = 0;
    let incomplete = false;
    let invalid = false;
    let quantity = 0;
    let itemCount = 0;
    const lineTotals: Array<number | null> = [];

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

      const lineIsValid =
        filled &&
        description &&
        parsedQuantity !== null &&
        Number.isInteger(parsedQuantity) &&
        parsedQuantity > 0 &&
        parsedPrice !== null &&
        Number.isFinite(parsedPrice) &&
        parsedPrice >= 0;

      if (lineIsValid) {
        const gross = parsedQuantity * parsedPrice;
        const hasFixed = line.fixedTotal !== null;
        const excl = hasFixed ? line.fixedTotal! / (1 + VAT_RATE) : line.vatIncluded ? gross / (1 + VAT_RATE) : gross;
        const incl = hasFixed ? line.fixedTotal! : line.vatIncluded ? gross : gross * (1 + VAT_RATE);
        subtotal += excl;
        total += incl;
        quantity += parsedQuantity;
        itemCount += 1;
        lineTotals.push(round2(incl));
      } else {
        lineTotals.push(null);
      }
    });

    subtotal = round2(subtotal);
    total = round2(total);
    const vat = round2(total - subtotal);
    if (quantity > 100000 || subtotal > 1000000000) invalid = true;
    const advance = paidInAdvance ? total : depositOn ? parseAmount(prepayment) : 0;
    const settledByRest = restPaid && !paidInAdvance && total > 0;
    const remaining = settledByRest
      ? 0
      : advance !== null && Number.isFinite(advance)
        ? Math.max(0, round2(total - advance))
        : total;
    const paymentStatus = settledByRest || (advance !== null && advance >= total && total > 0)
      ? 'Volledig betaald'
      : advance !== null && advance > 0
        ? 'Deels betaald'
        : 'Niet betaald';
    return { subtotal, vat, total, advance, remaining, paymentStatus, incomplete, invalid, quantity, itemCount, lineTotals };
  }, [lines, prepayment, paidInAdvance, depositOn, restPaid]);

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

  // Na het opslaan: bijhouden welke bestanden per product binnen zijn (ook via de QR-code).
  const createdTrackingToken = createdTicket?.trackingToken;
  const uploadsBusy = Object.values(uploadStates).some((state) => state === 'uploading');
  useEffect(() => {
    if (!createdTrackingToken) return undefined;
    let active = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/public/orders/${encodeURIComponent(createdTrackingToken)}`, { credentials: 'include' });
        if (!response.ok) return;
        const body = await response.json();
        const next: Record<string, TicketFileStatus[]> = {};
        for (const product of body?.ticket?.products || []) next[product.id] = Array.isArray(product.files) ? product.files : [];
        if (active) setReceivedFiles(next);
      } catch {
        /* volgende ronde opnieuw */
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [createdTrackingToken, uploadsBusy]);

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
    setAddress('');
    setPostcodeCity('');
    setEmail('');
    setPhone('');
    setReference('');
    setLines([emptyLine(products[0])]);
    setDeliveryDate('');
    setDeliveryMethod('Afhalen');
    setDeliveryAddress('');
    setAssignedStaff('');
    setHelpedBy('');
    setStatus('Nieuw');
    setCustomerApproved(false);
    setPrepayment('0,00');
    setPaidInAdvance(false);
    setDepositOn(false);
    setRestPaid(false);
    setNotes('');
    setInternalNotes('');
    setError('');
    setCreatedTicket(null);
    setCalculatorIndex(null);
    setPrepressIndex(null);
    setUploadStates({});
    setReceivedFiles({});
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const usedLines = lines.filter((line) => line.description.trim() || line.price.trim());
    const validLines = usedLines
      .map((line) => ({
        description: line.description.trim(),
        productId: line.productId,
        category: line.category,
        widthMm: Number(line.width),
        heightMm: Number(line.height),
        printSides: line.category === 'Sticker' ? 'single' : line.printSides,
        quantity: Number(line.quantity),
        unitPrice: parseAmount(line.price) ?? Number.NaN,
        vatIncluded: line.fixedTotal !== null ? true : line.vatIncluded,
        ...(line.fixedTotal !== null ? { fixedTotal: line.fixedTotal } : {}),
        ...(line.sku ? { sku: line.sku } : {}),
        ...(line.priceSource ? { priceSource: line.priceSource } : {}),
        ...(line.file && line.prepressNote ? { prepressNote: line.prepressNote } : {}),
      }));

    if (totals.incomplete || totals.invalid || validLines.length === 0) {
      setError('Vul iedere gebruikte productregel volledig en geldig in (aantal, omschrijving en prijs per stuk).');
      return;
    }
    if (totals.advance === null || !Number.isFinite(totals.advance) || totals.advance < 0 || totals.advance > totals.total) {
      setError('Vul een geldige aanbetaling in die niet hoger is dan het totaalbedrag.');
      return;
    }
    const customerAddressLine = [address.trim(), postcodeCity.trim()].filter(Boolean).join(', ');
    const finalDeliveryAddress = deliveryMethod === 'Bezorgen' ? (deliveryAddress.trim() || customerAddressLine) : '';
    if (deliveryMethod === 'Bezorgen' && !finalDeliveryAddress) {
      setError('Vul een afleveradres of het adres van de klant in voor bezorging.');
      return;
    }

    const helper = publicAccess ? helpedBy.trim() : assignedStaff;
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
      client_address: address.trim(),
      client_postcode_city: postcodeCity.trim(),
      delivery_date: deliveryDate,
      delivery_method: deliveryMethod,
      delivery_address: finalDeliveryAddress,
      assisted_by: helper,
      order_status: publicAccess ? 'Nieuw' : status,
      payment_status: totals.paymentStatus,
      products_json: JSON.stringify(validLines),
      subtotal: totals.subtotal,
      vat: totals.vat,
      grand_total: totals.total,
      prepayment: totals.advance,
      remaining: totals.remaining,
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
      const uploadLinks: CreatedTicket['productUploadLinks'] = Array.isArray(result.productUploadLinks) ? result.productUploadLinks : [];
      setCreatedTicket({
        id: result.orderId,
        trackingToken: result.trackingToken,
        createdAt: new Date().toISOString(),
        data: payload,
        productUploadLinks: uploadLinks,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Bestanden die bij een product zijn toegevoegd direct aan dat product koppelen.
      const pending = usedLines
        .map((line, index) => ({ file: line.file, index, token: uploadLinks[index]?.uploadToken }))
        .filter((entry): entry is { file: File; index: number; token: string } => Boolean(entry.file && entry.token));
      setUploadStates(Object.fromEntries(pending.map((entry) => [entry.index, 'uploading' as const])));
      for (const entry of pending) {
        let uploaded = false;
        try {
          const dataUrl = await readFileAsDataUrl(entry.file);
          const uploadResponse = await fetch(`/api/public/orders/${encodeURIComponent(entry.token)}/product-files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: { fileName: entry.file.name, fileType: getUploadFileType(entry.file), dataUrl } }),
          });
          uploaded = uploadResponse.ok;
        } catch (uploadError) {
          console.error('Bestand uploaden mislukt:', uploadError);
        }
        setUploadStates((current) => ({ ...current, [entry.index]: uploaded ? 'done' : 'error' }));
      }
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
    const linesForEmail = JSON.parse(String(createdTicket.data.products_json)) as SavedLine[];
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
          `${line.quantity}x ${line.description} — ${money(lineTotalIncl(line.quantity, Number(line.unitPrice), line.vatIncluded, line.fixedTotal))} incl. btw`,
          ...(uploadUrl ? [`Upload bestanden voor dit product: ${uploadUrl}`] : []),
        ];
      }),
      '',
      `Subtotaal: ${money(Number(createdTicket.data.subtotal))}`,
      `BTW 21%: ${money(Number(createdTicket.data.vat))}`,
      `Totaal: ${money(Number(createdTicket.data.grand_total))}`,
      `Aanbetaling: ${money(Number(createdTicket.data.prepayment))}`,
      `Restbedrag: ${money(Number(createdTicket.data.remaining))}`,
      '',
      `Volg de status van uw opdracht via: ${trackingUrl}`,
      '',
      'Met vriendelijke groet,',
      'FD Printing Center',
      ...COMPANY_FOOTER,
    ].join('\n');
    window.location.href = `mailto:${encodeURIComponent(String(createdTicket.data.clientEmail))}?subject=${encodeURIComponent(`Opdrachtbon ${createdTicket.data.order_number} · FD Printing Center`)}&body=${encodeURIComponent(emailBody)}`;
  };

  const printStyles = (
    <style>{`
      @media print {
        @page { size: A4; margin: 10mm; }
        body.job-ticket-printing * { visibility: hidden !important; }
        body.job-ticket-printing .job-ticket-document,
        body.job-ticket-printing .job-ticket-document * { visibility: visible !important; }
        body.job-ticket-printing .job-ticket-document { position: absolute; inset: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
        body.job-ticket-printing .no-print { display: none !important; }
        body.job-ticket-printing .print-break { break-before: page; }
        .job-ticket-document * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
  );

  /* -------------------------- Weergave na opslaan -------------------------- */
  if (createdTicket) {
    const d = createdTicket.data;
    const orderLines = JSON.parse(String(d.products_json)) as SavedLine[];
    const prepaid = Number(d.prepayment || 0);
    const grandTotal = Number(d.grand_total || 0);
    const fullyPrepaid = grandTotal > 0 && prepaid >= grandTotal;
    const restSettled = grandTotal > 0 && !fullyPrepaid && String(d.payment_status) === 'Volledig betaald';
    const customerFields: Array<[string, unknown]> = [
      ['Naam :', d.clientName],
      ['Contact persoon:', d.contact_person],
      ['Adres:', d.client_address],
      ['Postcode/Plaats:', d.client_postcode_city],
      ['Telefoon:', d.clientPhone === '-' ? '' : d.clientPhone],
      ['Email:', d.clientEmail],
    ];

    return (
      <div className="mx-auto max-w-4xl space-y-5 animate-fade-in font-sans">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <h3 className="text-base font-extrabold text-emerald-900">Opdrachtbon opgeslagen</h3>
            <p className="mt-0.5 text-xs text-emerald-800">De bon staat in het ordersysteem. Ieder product heeft een eigen QR-code om bestanden aan te leveren.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={emailTicket} className="inline-flex items-center gap-2 rounded-lg bg-[#e31c24] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#b8141a]">
              <Send className="h-4 w-4" /> Mailen naar klant
            </button>
            <button type="button" onClick={printTicket} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
              <Printer className="h-4 w-4" /> Printen / Opslaan als PDF
            </button>
          </div>
        </div>

        <article className="job-ticket-document rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-10">
          <header className="grid gap-6 sm:grid-cols-2">
            <div>
              {customerFields.map(([label, value]) => (
                <FieldRow key={label} label={label}><ReadValue>{value ? String(value) : ''}</ReadValue></FieldRow>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <SheetLogo date={formatDate(createdTicket.createdAt)} />
              <div>
                <FieldRow label="Bon nummer:"><ReadValue><span className="font-mono text-xs">{String(d.order_number)}</span></ReadValue></FieldRow>
                <FieldRow label="Geholpen door:"><ReadValue>{d.assisted_by ? String(d.assisted_by) : ''}</ReadValue></FieldRow>
                <FieldRow label="Datum:"><ReadValue>{formatDate(createdTicket.createdAt)}</ReadValue></FieldRow>
                {d.clientReference ? <FieldRow label="Referentie:"><ReadValue>{String(d.clientReference)}</ReadValue></FieldRow> : null}
              </div>
            </div>
          </header>

          <hr className="my-5 border-slate-400" />

          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="text-base font-bold">
                <th className="w-16 pb-2">Aantal</th>
                <th className="pb-2">Product omschrijving</th>
                <th className="w-24 pb-2 text-right">Per stuk</th>
                <th className="w-16 pb-2 text-center">BTW</th>
                <th className="w-28 pb-2 text-right">Prijs</th>
              </tr>
            </thead>
            <tbody>
              {orderLines.map((line, index) => (
                <tr key={`${line.description}-${index}`} className="border-t border-slate-100 align-top">
                  <td className="py-2 tabular-nums">{line.quantity}</td>
                  <td className="py-2">
                    <p className="font-medium">{line.description}</p>
                    {line.widthMm && line.heightMm ? (
                      <p className="text-xs text-slate-500">
                        {line.widthMm} × {line.heightMm} mm · {line.printSides === 'double' ? 'Dubbelzijdig' : 'Enkelzijdig'}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(Number(line.unitPrice))}</td>
                  <td className="py-2 text-center text-xs">{line.vatIncluded ? 'incl.' : 'excl.'}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{money(lineTotalIncl(line.quantity, Number(line.unitPrice), line.vatIncluded, line.fixedTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_17rem]">
            <div>
              <h3 className="text-base font-bold">Notitie’s</h3>
              <p className="mt-1 min-h-[4rem] whitespace-pre-wrap text-sm text-slate-700">{d.notes ? String(d.notes) : ''}</p>
            </div>
            <TotalsBlock subtotal={Number(d.subtotal)} vat={Number(d.vat)} total={grandTotal} />
          </section>

          <section className="mt-5 grid border border-slate-800 sm:grid-cols-3">
            <PaymentBox title="Aanbetaling" checked={prepaid > 0 && !fullyPrepaid}>
              <p className="text-lg tabular-nums">{prepaid > 0 && !fullyPrepaid ? money(prepaid) : '€'}</p>
            </PaymentBox>
            <PaymentBox title="Rest bedrag" checked={restSettled}>
              <p className="text-lg tabular-nums">{money(restSettled ? Math.max(0, grandTotal - prepaid) : Number(d.remaining || 0))}</p>
            </PaymentBox>
            <PaymentBox title="Vooruit betaling" checked={fullyPrepaid} shaded>
              <p className="text-lg tabular-nums">{fullyPrepaid ? money(prepaid) : '€'}</p>
            </PaymentBox>
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm font-bold">Orderdatum:</span>
              <span className="rounded bg-slate-100 px-3 py-2 text-sm">{formatDate(createdTicket.createdAt)}</span>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm font-bold">Leverdatum:</span>
              <span className="rounded bg-slate-100 px-3 py-2 text-sm">
                {[formatIsoDate(d.delivery_date), String(d.delivery_method || '')].filter(Boolean).join(' · ')}
              </span>
            </div>
            {d.delivery_address ? (
              <p className="text-sm sm:col-span-2"><strong>Afleveradres:</strong> {String(d.delivery_address)}</p>
            ) : null}
          </section>

          <section className="mt-4 flex items-center gap-4 rounded-lg border border-slate-200 p-3">
            <TicketQr value={trackingUrl} label="de status van uw opdracht" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold">Volg uw opdracht</h3>
              <p className="mt-0.5 text-xs text-slate-600">Scan de QR-code om de status te bekijken en te zien wat u nog moet doen, zoals een bestand aanleveren.</p>
              <a className="no-print mt-1 block break-all text-[10px] font-semibold text-blue-700 underline" href={trackingUrl}>{trackingUrl}</a>
            </div>
          </section>

          <SheetFooter />

          <section className="print-break mt-8 space-y-3">
            <div>
              <h3 className="text-base font-extrabold">Bestanden aanleveren</h3>
              <p className="mt-1 text-xs text-slate-500">Scan de QR-code of open de link om per product uw bestanden te uploaden. Uw bestanden komen direct bij de juiste opdracht binnen.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {orderLines.map((line, index) => {
                const upload = createdTicket.productUploadLinks[index];
                if (!upload) return null;
                const uploadUrl = `${window.location.origin}/klantportal?token=${encodeURIComponent(upload.uploadToken)}`;
                return (
                  <article key={upload.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <TicketQr value={uploadUrl} label={line.description} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="break-words text-sm font-bold">{line.description}</h4>
                      <p className="text-xs text-slate-500">{line.quantity} stuks{line.widthMm && line.heightMm ? ` · ${line.widthMm} × ${line.heightMm} mm` : ''}</p>
                      <a className="block break-all text-[10px] font-semibold text-blue-700 underline" href={uploadUrl}>{uploadUrl}</a>
                      <div className="no-print flex flex-wrap items-center gap-1.5 pt-1">
                        {(receivedFiles[upload.id] || []).map((file) => (
                          <span key={file.id} title={file.fileName}>
                            <FileThumb remoteUrl={`/api/public/orders/${encodeURIComponent(upload.uploadToken)}/files/${encodeURIComponent(file.id)}`} fileName={file.fileName} fileType={file.fileType} size={36} />
                          </span>
                        ))}
                        <span className={`text-[11px] font-semibold ${uploadStates[index] === 'error' ? 'text-rose-700' : (receivedFiles[upload.id] || []).length ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {uploadStates[index] === 'uploading'
                            ? 'Bestand wordt geüpload…'
                            : uploadStates[index] === 'error'
                              ? 'Uploaden mislukt. Lever het bestand opnieuw aan via de QR-code of link.'
                              : (receivedFiles[upload.id] || []).length
                                ? `${(receivedFiles[upload.id] || []).length} bestand${(receivedFiles[upload.id] || []).length === 1 ? '' : 'en'} ontvangen`
                                : 'Nog geen bestand ontvangen'}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {createdTicket.productUploadLinks.length !== orderLines.length && (
              <p role="alert" className="no-print rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Niet voor ieder product is een uploadcode aangemaakt. Neem contact op met de beheerder voordat u de bon deelt.
              </p>
            )}
          </section>

          {d.internal_notes ? (
            <p className="no-print mt-5 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><strong>Interne notitie:</strong> {String(d.internal_notes)}</p>
          ) : null}
        </article>

        <div className="no-print flex flex-wrap gap-3">
          <button type="button" onClick={resetForm} className="rounded-lg bg-[#e31c24] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#b8141a]">
            Nieuwe opdrachtbon
          </button>
          <button type="button" onClick={onViewOrders} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {publicAccess ? 'Terug naar startpagina' : 'Naar orders overzicht'}
          </button>
        </div>
        {printStyles}
      </div>
    );
  }

  /* ------------------------------ Invoerformulier ------------------------------ */
  const fullyPrepaidPreview = paidInAdvance && totals.total > 0;
  const advanceValue = totals.advance !== null && Number.isFinite(totals.advance) ? totals.advance : 0;

  return (
    <div className="mx-auto max-w-4xl animate-fade-in font-sans">
      <form onSubmit={submitOrder} className="space-y-4">
        {/* Werkbalk, zoals de knoppen bovenaan de papieren bon */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Nieuwe opdrachtbon</h2>
            <p className="text-xs text-slate-500">Na opslaan staat de opdracht direct in het backoffice ordersysteem.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Eraser className="h-4 w-4" /> Leegmaken
            </button>
            <button type="submit" disabled={isSaving || totals.itemCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#e31c24] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="h-4 w-4" /> {isSaving ? 'Opslaan…' : 'Opdrachtbon opslaan'}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</p>}

        {!publicAccess && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Orderstatus</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className={boxInput}>
                {ORDER_STATUSES.map((orderStatus) => <option key={orderStatus}>{orderStatus}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-md border border-slate-300 px-3 py-2">
              <input type="checkbox" checked={customerApproved} onChange={(event) => setCustomerApproved(event.target.checked)} className="h-4 w-4 accent-[#e31c24]" />
              <span className="text-sm text-slate-700">Klantakkoord ontvangen</span>
            </label>
          </div>
        )}

        {/* Het bonformulier zelf */}
        <article className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-10">
          <header className="grid gap-6 sm:grid-cols-2">
            <div>
              <FieldRow label="Naam :" htmlFor="ticket-name">
                <input id="ticket-name" required maxLength={200} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Klant- of bedrijfsnaam" className={lineInput} />
              </FieldRow>
              <FieldRow label="Contact persoon:" htmlFor="ticket-contact">
                <input id="ticket-contact" maxLength={200} value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} className={lineInput} />
              </FieldRow>
              <FieldRow label="Adres:" htmlFor="ticket-address">
                <input id="ticket-address" maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" className={lineInput} />
              </FieldRow>
              <FieldRow label="Postcode/Plaats:" htmlFor="ticket-postcode">
                <input id="ticket-postcode" maxLength={200} value={postcodeCity} onChange={(event) => setPostcodeCity(event.target.value)} placeholder="1102 DA Amsterdam" className={lineInput} />
              </FieldRow>
              <FieldRow label="Telefoon:" htmlFor="ticket-phone">
                <input id="ticket-phone" type="tel" maxLength={100} value={phone} onChange={(event) => setPhone(event.target.value)} className={lineInput} />
              </FieldRow>
              <FieldRow label="Email:" htmlFor="ticket-email">
                <input id="ticket-email" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="naam@bedrijf.nl" className={lineInput} />
              </FieldRow>
            </div>

            <div className="flex flex-col gap-3">
              <SheetLogo date={today} />
              <div>
                <FieldRow label="Bon nummer:">
                  <ReadValue><span className="font-mono text-xs">{ticketNumber}</span></ReadValue>
                </FieldRow>
                <FieldRow label="Geholpen door:" htmlFor="ticket-helper">
                  {publicAccess ? (
                    <input id="ticket-helper" maxLength={200} value={helpedBy} onChange={(event) => setHelpedBy(event.target.value)} placeholder="Naam medewerker" className={lineInput} />
                  ) : (
                    <select id="ticket-helper" value={assignedStaff} onChange={(event) => setAssignedStaff(event.target.value)} className={lineInput}>
                      <option value="">— kies medewerker —</option>
                      {staff.map((member) => <option key={member.id} value={member.name}>{member.name} ({member.role})</option>)}
                    </select>
                  )}
                </FieldRow>
                <FieldRow label="Datum:"><ReadValue>{today}</ReadValue></FieldRow>
                <FieldRow label="Referentie:" htmlFor="ticket-reference">
                  <input id="ticket-reference" maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optioneel" className={lineInput} />
                </FieldRow>
              </div>
            </div>
          </header>

          <hr className="my-5 border-slate-400" />

          {/* Productregels */}
          <div className="hidden grid-cols-[4.5rem_1fr_6.5rem_6.5rem_6.5rem_2rem] gap-3 pb-2 text-base font-bold md:grid">
            <span>Aantal</span>
            <span>Product omschrijving</span>
            <span className="text-right">Per stuk</span>
            <span className="text-center leading-none">BTW<span className="mt-0.5 block text-[10px] font-semibold text-slate-500">incl. · excl.</span></span>
            <span className="text-right">Prijs</span>
            <span />
          </div>

          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-2 gap-3 py-3 md:grid-cols-[4.5rem_1fr_6.5rem_6.5rem_6.5rem_2rem] md:items-start">
                <label className="space-y-1 md:space-y-0">
                  <span className="text-[10px] font-bold uppercase text-slate-500 md:hidden">Aantal</span>
                  <input type="number" min="1" max="100000" step="1" required value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} aria-label={`Aantal regel ${index + 1}`} className={`${lineInput} tabular-nums`} />
                </label>

                <div className="col-span-2 space-y-2 md:col-span-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 md:hidden">Product omschrijving</span>
                  <ProductSearchInput
                    value={line.description}
                    onChange={(value) => updateLine(index, { description: value })}
                    onPick={(product) => pickCatalogProduct(index, product)}
                    products={catalog.products}
                    placeholder={catalog.products.length ? 'Typ om een product te zoeken, bijv. "flyers a5 250"' : 'Omschrijving van het product'}
                    ariaLabel={`Omschrijving regel ${index + 1}`}
                    className={lineInput}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <select value={line.productId} onChange={(event) => handleProductChange(index, event.target.value)} aria-label={`Productsoort regel ${index + 1}`} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs">
                      {!products.some((product) => product.id === line.productId) && <option value={line.productId}>Eigen formaat</option>}
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min="1" max="100000" required value={line.width} onChange={(event) => updateLine(index, { width: event.target.value })} aria-label={`Breedte in mm regel ${index + 1}`} className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs tabular-nums" />
                      ×
                      <input type="number" min="1" max="100000" required value={line.height} onChange={(event) => updateLine(index, { height: event.target.value })} aria-label={`Hoogte in mm regel ${index + 1}`} className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs tabular-nums" />
                      mm
                    </span>
                    <select disabled={line.category === 'Sticker'} value={line.category === 'Sticker' ? 'single' : line.printSides} onChange={(event) => updateLine(index, { printSides: event.target.value as 'single' | 'double' })} aria-label={`Zijdigheid regel ${index + 1}`} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs disabled:opacity-60">
                      <option value="single">Enkelzijdig</option>
                      <option value="double">Dubbelzijdig</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" onClick={() => setCalculatorIndex(calculatorIndex === index ? null : index)} aria-expanded={calculatorIndex === index} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                      <Calculator className="h-3.5 w-3.5" /> Calculator
                    </button>
                    {line.file ? (
                      <span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 py-0.5 pl-0.5 pr-1">
                        <FileThumb file={line.file} fileName={line.file.name} size={30} />
                        <span className="max-w-[11rem] truncate font-semibold text-emerald-900" title={line.file.name}>{line.file.name}</span>
                        <button type="button" onClick={() => setPrepressIndex(index)} className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-1 font-bold text-white hover:bg-slate-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> {line.prepressNote ? 'Gecheckt' : 'Pre-press check'}
                        </button>
                        <button type="button" onClick={() => chooseFile(index, null)} aria-label={`Bestand van regel ${index + 1} verwijderen`} className="rounded p-1 text-slate-500 hover:bg-emerald-100">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                        <Paperclip className="h-3.5 w-3.5" /> Bestand toevoegen
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                          className="sr-only"
                          onChange={(event) => {
                            chooseFile(index, event.target.files?.[0] ?? null);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    )}
                    {line.priceSource && <span className="text-[10px] text-slate-400">Prijs: {line.priceSource}</span>}
                  </div>
                </div>

                <label className="space-y-1 md:space-y-0">
                  <span className="text-[10px] font-bold uppercase text-slate-500 md:hidden">Per stuk (€)</span>
                  <input required inputMode="decimal" value={line.price} onChange={(event) => updateLine(index, { price: event.target.value })} placeholder="0,00" aria-label={`Prijs per stuk regel ${index + 1}`} className={`${lineInput} text-right tabular-nums`} />
                </label>

                <div className="space-y-1 md:space-y-0">
                  <span className="text-[10px] font-bold uppercase text-slate-500 md:hidden">BTW</span>
                  <div role="radiogroup" aria-label={`BTW regel ${index + 1}`} className="flex justify-center gap-1">
                    {[true, false].map((included) => (
                      <button
                        key={String(included)}
                        type="button"
                        role="radio"
                        aria-checked={line.vatIncluded === included}
                        onClick={() => updateLine(index, { vatIncluded: included })}
                        className={`rounded-full border-2 px-2 py-1 text-[11px] font-bold transition-colors ${line.vatIncluded === included ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-500 hover:border-slate-500'}`}
                      >
                        {included ? 'incl.' : 'excl.'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-right md:space-y-0">
                  <span className="text-[10px] font-bold uppercase text-slate-500 md:hidden">Prijs incl. btw</span>
                  <p className="py-1 text-base font-semibold tabular-nums">{money(totals.lineTotals[index] ?? 0)}</p>
                </div>

                <button type="button" aria-label={`Regel ${index + 1} verwijderen`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))} className="flex h-8 w-8 items-center justify-center justify-self-end rounded-md text-slate-400 hover:bg-rose-50 hover:text-[#e31c24] disabled:cursor-not-allowed disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>

                {calculatorIndex === index && (
                  <PriceCalculatorPanel
                    initialKind={line.category === 'Banner' ? 'banner' : 'sticker'}
                    onApply={(applied) => applyCalculator(index, applied)}
                    onClose={() => setCalculatorIndex(null)}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {catalog.loading
              ? 'Productcatalogus laden…'
              : catalog.products.length
                ? `${catalog.products.length} producten uit FDPBRAIN beschikbaar. Bestanden kunnen ook na het opslaan via de QR-code per product worden aangeleverd.`
                : 'De productcatalogus uit Notion is nog niet gekoppeld; vul omschrijving en prijs met de hand in of gebruik de calculator.'}
          </p>

          <button type="button" onClick={() => setLines((current) => [...current, emptyLine(products[0])])} className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-500 hover:text-slate-900">
            <Plus className="h-3.5 w-3.5" /> Regel toevoegen
          </button>

          {/* Notities + totalen */}
          <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_17rem]">
            <label className="block">
              <span className="text-base font-bold">Notitie’s</span>
              <textarea maxLength={2000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opmerkingen voor de klant (komen op de bon)" className="mt-1 w-full resize-y rounded-md border border-slate-200 p-2 text-sm focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]" />
            </label>
            <TotalsBlock subtotal={totals.subtotal} vat={totals.vat} total={totals.total} />
          </section>

          {/* Betaalvakken: aanvinken om direct te registreren dat er betaald is */}
          <section className="mt-5 grid border border-slate-800 sm:grid-cols-3">
            <PaymentBox
              title="Aanbetaling"
              checked={depositOn && !paidInAdvance}
              disabled={paidInAdvance}
              onToggle={(next) => {
                setDepositOn(next);
                if (next) {
                  setPaidInAdvance(false);
                  setPrepayment('');
                  window.setTimeout(() => depositInputRef.current?.focus(), 0);
                } else {
                  setPrepayment('0,00');
                }
              }}
            >
              {depositOn && !paidInAdvance ? (
                <label className="flex items-center gap-1">
                  <span className="text-lg">€</span>
                  <input ref={depositInputRef} inputMode="decimal" value={prepayment} onChange={(event) => setPrepayment(event.target.value)} placeholder="0,00" aria-label="Aanbetaling in euro" className={`${lineInput} text-lg tabular-nums`} />
                </label>
              ) : (
                <p className="text-lg text-slate-400">€</p>
              )}
            </PaymentBox>
            <PaymentBox
              title="Rest bedrag"
              checked={restPaid && !paidInAdvance}
              disabled={paidInAdvance || totals.total <= 0}
              onToggle={(next) => setRestPaid(next)}
            >
              <p className="text-lg tabular-nums">{money(restPaid && !paidInAdvance ? Math.max(0, round2(totals.total - advanceValue)) : totals.remaining)}</p>
              <p className="-mt-1 text-xs text-slate-500">{restPaid && !paidInAdvance ? 'Rest is voldaan' : 'Vink aan als het restbedrag is betaald'}</p>
            </PaymentBox>
            <PaymentBox
              title="Vooruit betaling"
              checked={fullyPrepaidPreview}
              shaded
              disabled={totals.total <= 0}
              onToggle={(next) => {
                setPaidInAdvance(next);
                if (next) {
                  setDepositOn(false);
                  setRestPaid(false);
                  setPrepayment('0,00');
                }
              }}
            >
              <p className="text-lg tabular-nums">{fullyPrepaidPreview ? money(totals.total) : '€'}</p>
            </PaymentBox>
          </section>

          {/* Order- en leverdatum */}
          <section className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm font-bold">Orderdatum:</span>
              <span className="rounded bg-slate-100 px-3 py-2 text-sm">{today}</span>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
              <label htmlFor="ticket-delivery-date" className="text-sm font-bold">Leverdatum:</label>
              <div className="flex min-w-0 flex-wrap gap-2">
                <input id="ticket-delivery-date" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="min-w-[9rem] flex-1 rounded border-0 bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#e31c24]" />
                <select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as 'Afhalen' | 'Bezorgen')} aria-label="Levermethode" className="rounded border-0 bg-slate-100 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#e31c24]">
                  <option>Afhalen</option>
                  <option>Bezorgen</option>
                </select>
              </div>
            </div>
            {deliveryMethod === 'Bezorgen' && (
              <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 sm:col-span-2">
                <span className="text-sm font-bold">Afleveradres:</span>
                <input maxLength={1000} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder={address || postcodeCity ? `Leeg = klantadres (${[address, postcodeCity].filter(Boolean).join(', ')})` : 'Straat, huisnummer, postcode en plaats'} className="rounded bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#e31c24]" />
              </label>
            )}
          </section>

          <SheetFooter />
        </article>

        {!publicAccess && (
          <label className="block rounded-xl border border-amber-200 bg-amber-50 p-4">
            <span className="block text-[10px] font-bold uppercase text-amber-800">Interne notitie (niet zichtbaar voor de klant)</span>
            <textarea maxLength={2000} rows={2} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Bijvoorbeeld: sneldruk gewenst." className="mt-1 w-full rounded-md border border-amber-200 bg-white p-2 text-sm" />
          </label>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={isSaving || totals.itemCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#e31c24] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50">
            <Save className="h-4 w-4" /> {isSaving ? 'Opdrachtbon opslaan…' : 'Opdrachtbon opslaan'}
          </button>
        </div>
      </form>
      {prepressIndex !== null && lines[prepressIndex]?.file && (
        <TicketPrepressModal
          file={lines[prepressIndex].file!}
          description={lines[prepressIndex].description}
          category={lines[prepressIndex].category}
          widthMm={Number(lines[prepressIndex].width) || 210}
          heightMm={Number(lines[prepressIndex].height) || 297}
          onClose={() => setPrepressIndex(null)}
          onDone={(outcome) => {
            updateLine(prepressIndex, outcome.file ? { prepressNote: outcome.note, file: outcome.file } : { prepressNote: outcome.note });
            setPrepressIndex(null);
          }}
        />
      )}
      {printStyles}
    </div>
  );
}
