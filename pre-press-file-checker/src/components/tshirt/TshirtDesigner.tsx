import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Loader2, Minus, Plus, Shirt, Trash2, UploadCloud } from 'lucide-react';
import { FDLogo } from '../FDLogo';
import { BRANCH_DETAILS } from '../../utils/branches';
import {
  TSHIRT_COLORS,
  TSHIRT_DESIGN_FEE,
  TSHIRT_FORMATS,
  TSHIRT_MAX_PRINTS,
  TSHIRT_PRINT_PRICES,
  TSHIRT_SIZES,
  TSHIRT_TIERS,
  TshirtColor,
  TshirtSide,
  TshirtSize,
  TshirtSpec,
  calculateTshirtPrice,
  formatForSize,
  printsFromDesigns,
} from '../../utils/tshirtPricing';
import { CheckItem, TSHIRT_MAX_TOTAL_BYTES, TshirtImage, checkTshirtImage, effectiveDpi, loadTshirtImage, worstLevel } from '../../utils/tshirtPrepress';
import { PlacedDesign, TshirtCanvas, clampPosition, clampScale } from './TshirtMockup';

interface Design extends PlacedDesign {
  image: TshirtImage;
}

const SIDES: TshirtSide[] = ['voor', 'achter'];
const sideLabel = (side: TshirtSide) => (side === 'voor' ? 'Voorkant' : 'Achterkant');
const money = (value: number) => `€ ${value.toFixed(2).replace('.', ',')}`;
const cm = (mm: number) => (mm / 10).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const inputClass = 'w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]';
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.text} className={`flex gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${item.level === 'ok' ? 'bg-emerald-50 text-emerald-800' : item.level === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'}`}>
          {item.level === 'ok' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Zet een (niet-bewerkbaar) shirt-SVG om naar een PNG als proefbeeld. */
async function svgToPng(svg: SVGSVGElement | null, width = 900): Promise<string | null> {
  if (!svg) return null;
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(Math.round(width * 340 / 400)));
    const markup = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('proef'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * 340 / 400);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#f1f5f9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export default function TshirtDesigner({ onBack }: { onBack: () => void }) {
  const [color, setColor] = useState<TshirtColor>('wit');
  const [activeSide, setActiveSide] = useState<TshirtSide>('voor');
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Partial<Record<TshirtSize, number>>>({ M: 1 });
  const [designFee, setDesignFee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const proofRefs = useRef<Record<TshirtSide, SVGSVGElement | null>>({ voor: null, achter: null });

  const [step, setStep] = useState<'design' | 'details' | 'done'>('design');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', branch: '', comments: '' });
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<{ orderId: string; trackingToken: string } | null>(null);

  const sideDesigns = designs.filter((design) => design.side === activeSide);
  const selected = designs.find((design) => design.id === selectedId) ?? null;
  const prints = printsFromDesigns(designs);
  const spec: TshirtSpec = { color, sizes, prints, designFee };
  const price = calculateTshirtPrice(spec);
  const quantity = price.quantity;
  const tierPrice = (design: Design) => {
    const format = formatForSize(design.widthMm, design.heightMm) ?? 'a3';
    return { format, price: TSHIRT_PRINT_PRICES[format][price.tierIndex] };
  };
  const checksFor = (design: Design) => checkTshirtImage(design.image, { widthMm: design.widthMm, heightMm: design.heightMm }, color);

  const nextTier = useMemo(() => {
    if (!price.valid) return null;
    const next = TSHIRT_TIERS[price.tierIndex + 1];
    if (!next) return null;
    const perShirt = TSHIRT_COLORS[color].price + prints.reduce((sum, print) => sum + TSHIRT_PRINT_PRICES[print.format][price.tierIndex + 1], 0);
    return { count: next.min, perShirt };
  }, [price.valid, price.tierIndex, color, prints]);

  const updateDesign = (changed: PlacedDesign) => {
    setDesigns((current) => current.map((design) => (design.id === changed.id ? { ...design, ...changed } : design)));
  };

  const addFile = async (file: File | null | undefined) => {
    if (!file) return;
    setFileError('');
    if (designs.length >= TSHIRT_MAX_PRINTS) {
      setFileError(`Maximaal ${TSHIRT_MAX_PRINTS} opdrukken per bestelling.`);
      return;
    }
    setLoading(true);
    try {
      const image = await loadTshirtImage(file);
      const totalBytes = designs.reduce((sum, design) => sum + design.image.bytes, 0) + image.bytes;
      if (totalBytes > TSHIRT_MAX_TOTAL_BYTES) throw new Error('Samen zijn de bestanden te groot (max 40 MB). Maak een bestand kleiner of lever het aan in de winkel.');
      const first = sideDesigns.length === 0;
      // Eerste opdruk groot in het midden; extra opdrukken klein op de borst of in de nek.
      const box = first ? { width: 250, height: 300 } : { width: 90, height: 90 };
      const ratio = image.pixelWidth / image.pixelHeight;
      let widthMm = ratio > box.width / box.height ? box.width : box.height * ratio;
      let heightMm = widthMm / ratio;
      const factor = clampScale(widthMm, heightMm, 1);
      widthMm *= factor;
      heightMm *= factor;
      const position = first
        ? { xMm: 0, yMm: (activeSide === 'voor' ? 90 : 70) + heightMm / 2 }
        : activeSide === 'voor' ? { xMm: 120, yMm: 110 + heightMm / 2 } : { xMm: 0, yMm: 40 + heightMm / 2 };
      const design: Design = clampPosition({
        id: newId(),
        side: activeSide,
        ...position,
        widthMm,
        heightMm,
        fileName: image.fileName,
        pixelWidth: image.pixelWidth,
        pixelHeight: image.pixelHeight,
        url: image.dataUrl,
        image,
      });
      setDesigns((current) => [...current, design]);
      setSelectedId(design.id);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Het bestand kon niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  const removeDesign = (id: string) => {
    setDesigns((current) => current.filter((design) => design.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const setSize = (size: TshirtSize, value: number) => {
    const count = Math.max(0, Math.min(999, Math.round(value) || 0));
    setSizes((current) => ({ ...current, [size]: count }));
  };

  const switchSide = (side: TshirtSide) => {
    setActiveSide(side);
    setSelectedId(null);
  };

  const canContinue = price.valid && designs.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim()) return setSubmitError('Vul uw naam, e-mailadres en telefoonnummer in.');
    if (!customer.branch) return setSubmitError('Kies het filiaal waar u de shirts wilt ophalen.');
    if (!rightsConfirmed) return setSubmitError('Bevestig dat u de afbeelding mag gebruiken.');
    if (!canContinue) return setSubmitError('Uw ontwerp is nog niet compleet.');

    setSubmitting(true);
    try {
      const proofs: Array<{ side: TshirtSide; fileName: string; fileType: string; dataUrl: string }> = [];
      for (const side of SIDES) {
        if (!designs.some((design) => design.side === side)) continue;
        const dataUrl = await svgToPng(proofRefs.current[side]);
        if (dataUrl) proofs.push({ side, fileName: `Proef ${sideLabel(side).toLowerCase()}.png`, fileType: 'image/png', dataUrl });
      }
      const first = designs[0];
      const designData = designs.map((design) => {
        const checks = checksFor(design);
        return {
          id: design.id,
          side: design.side,
          xMm: design.xMm,
          yMm: design.yMm,
          widthMm: design.widthMm,
          heightMm: design.heightMm,
          fileName: design.image.fileName,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          dpi: effectiveDpi(design.image, design.widthMm),
          check: worstLevel(checks),
          checkNotes: checks.filter((item) => item.level !== 'ok').map((item) => item.text),
        };
      });
      const orderData = {
        branch: customer.branch,
        clientName: customer.name.trim(),
        clientEmail: customer.email.trim(),
        clientPhone: customer.phone.trim(),
        clientReference: '',
        clientComments: customer.comments.trim().slice(0, 2000),
        clientQuantity: quantity,
        selectedProductId: 'tshirt-dtf',
        selectedProductName: `T-shirt ${TSHIRT_COLORS[color].name.toLowerCase()} DTF`,
        selectedProductCategory: 'T-shirt',
        customWidth: Math.max(1, Math.round(first.widthMm)),
        customHeight: Math.max(1, Math.round(first.heightMm)),
        printSides: designs.some((design) => design.side === 'achter') && designs.some((design) => design.side === 'voor') ? 'double' : 'single',
        tshirt_json: JSON.stringify({ spec: { color, sizes, designFee }, designs: designData }),
      };
      const tshirtFiles = designs.map((design) => ({ designId: design.id, fileName: design.image.fileName, fileType: design.image.fileType, dataUrl: design.image.dataUrl }));

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderData, tshirtFiles, tshirtProofs: proofs }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'De bestelling kon niet worden verstuurd.');
      setResult({ orderId: body.orderId, trackingToken: body.trackingToken });
      setStep('done');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'De bestelling kon niet worden verstuurd.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedChecks = selected ? checksFor(selected) : [];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <FDLogo />
            <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 sm:inline-flex"><Shirt className="h-3.5 w-3.5" /> T-shirt ontwerpen</span>
          </div>
          <button type="button" onClick={onBack} className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">&larr; Terug</button>
        </div>
      </header>

      {/* Proefbeelden (onzichtbaar), worden bij het bestellen als PNG meegestuurd. */}
      <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {SIDES.map((side) => (
          <TshirtCanvas key={side} ref={(node) => { proofRefs.current[side] = node; }} color={color} side={side} designs={designs.filter((design) => design.side === side)} />
        ))}
      </div>

      {step === 'done' && result ? (
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-black">Bedankt voor uw bestelling</h1>
          <p className="mt-2 text-sm text-slate-600">Opdrachtnummer <strong>{result.orderId}</strong>. We controleren uw ontwerp en nemen contact op als er iets aangepast moet worden. Betalen doet u bij het ophalen.</p>
          <a href={`/klantportal?token=${encodeURIComponent(result.trackingToken)}`} className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[#e31c24] px-5 text-sm font-bold text-white hover:bg-[#b8141a]">Volg uw opdracht</a>
        </main>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_28rem]">
          {/* Shirt */}
          <section className="flex flex-col items-center rounded-3xl bg-gradient-to-b from-slate-50 to-slate-200/60 p-4 sm:p-8">
            <TshirtCanvas
              color={color}
              side={activeSide}
              designs={sideDesigns}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateDesign}
              emptyHint
              className="w-full max-w-[36rem] drop-shadow-xl"
            />
            <p className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-slate-800 shadow-sm">{sideLabel(activeSide)}</p>
            <p className="mt-2 text-center text-[11px] text-slate-500">Sleep een opdruk om hem te verplaatsen. Trek aan een hoek of zijkant om hem groter of kleiner te maken.</p>
          </section>

          {/* Instellingen */}
          <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {step === 'design' ? (
              <>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ontwerp je eigen T-shirt</h1>

                {/* Kant kiezen */}
                <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Kant van het shirt">
                  {SIDES.map((side) => {
                    const count = designs.filter((design) => design.side === side).length;
                    return (
                      <button key={side} type="button" role="tab" aria-selected={activeSide === side} onClick={() => switchSide(side)} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-extrabold ${activeSide === side ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}>
                        <Shirt className="h-4 w-4" /> {sideLabel(side)}
                        {count > 0 && <span className="rounded-full bg-sky-700 px-1.5 text-[10px] text-white">{count}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Opdrukken op deze kant */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700">Opdrukken op de {sideLabel(activeSide).toLowerCase()}</p>
                  {sideDesigns.map((design, index) => {
                    const { format, price: printPrice } = tierPrice(design);
                    const level = worstLevel(checksFor(design));
                    return (
                      <div key={design.id} className={`flex items-center gap-3 rounded-xl border-2 p-2 ${selectedId === design.id ? 'border-sky-700 bg-sky-50/50' : 'border-slate-200'}`}>
                        <button type="button" onClick={() => setSelectedId(design.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <img src={design.image.dataUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-[conic-gradient(#e2e8f0_25%,#fff_0_50%,#e2e8f0_0_75%,#fff_0)] bg-[length:12px_12px] object-contain" />
                          <span className="min-w-0 text-xs">
                            <span className="block truncate font-bold text-slate-800">{index + 1}. {design.image.fileName}</span>
                            <span className="block text-slate-500">{cm(design.widthMm)} × {cm(design.heightMm)} cm · {TSHIRT_FORMATS[format].short} · {money(printPrice)} p/st</span>
                          </span>
                          {level !== 'ok' && <AlertTriangle className={`h-4 w-4 shrink-0 ${level === 'error' ? 'text-rose-600' : 'text-amber-500'}`} aria-label="Let op" />}
                        </button>
                        <button type="button" aria-label="Opdruk verwijderen" onClick={() => removeDesign(design.id)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-[#e31c24]"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}

                  {selected && selected.side === activeSide && (
                    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-700">Breedte</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="2"
                          max="42"
                          step="0.5"
                          value={Math.round(selected.widthMm / 5) / 2}
                          onChange={(event) => {
                            const wanted = Number(event.target.value) * 10;
                            if (!(wanted > 0)) return;
                            const factor = clampScale(selected.widthMm, selected.heightMm, wanted / selected.widthMm);
                            updateDesign(clampPosition({ ...selected, widthMm: selected.widthMm * factor, heightMm: selected.heightMm * factor }));
                          }}
                          aria-label="Breedte in cm"
                          className="min-h-[40px] w-20 rounded-lg border border-slate-300 px-2 text-sm font-bold tabular-nums"
                        />
                        <span className="text-slate-500">cm × {cm(selected.heightMm)} cm</span>
                        <button type="button" onClick={() => updateDesign({ ...selected, xMm: 0 })} className="ml-auto inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-bold hover:bg-slate-100"><Crosshair className="h-3.5 w-3.5" /> Centreren</button>
                      </div>
                      <CheckList items={selectedChecks} />
                    </div>
                  )}

                  {sideDesigns.length === 0 ? (
                    <div
                      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(event) => { event.preventDefault(); setDragOver(false); addFile(event.dataTransfer.files?.[0]); }}
                      onClick={() => fileInput.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click(); }}
                      className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-7 text-center ${dragOver ? 'border-[#e31c24] bg-rose-50' : 'border-sky-700/50 bg-slate-50/60 hover:bg-slate-50'}`}
                    >
                      {loading ? <Loader2 className="h-9 w-9 animate-spin text-slate-500" /> : <UploadCloud className="h-9 w-9 text-slate-500" />}
                      <p className="mt-2 text-base font-extrabold">Drag &amp; drop</p>
                      <p className="text-sm text-slate-600">of klik om te uploaden</p>
                      <p className="mt-1 text-[11px] text-slate-500">PNG of JPG, max 20 MB. Liefst PNG met transparante achtergrond.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={loading || designs.length >= TSHIRT_MAX_PRINTS}
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); addFile(event.dataTransfer.files?.[0]); }}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700 hover:border-slate-500 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Extra opdruk toevoegen
                    </button>
                  )}
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => { addFile(event.target.files?.[0]); event.target.value = ''; }} />
                  {fileError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{fileError}</p>}
                  <p className="text-[11px] text-slate-500">De prijs per opdruk hangt af van de maat: tot 10 × 10 cm, tot A4 (21 × 30 cm) of tot A3 (30 × 42 cm).</p>
                </div>

                {/* Kleur */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700">Kleur <span className="font-medium text-slate-500">(korte mouw)</span></p>
                  <div className="flex gap-3">
                    {(Object.keys(TSHIRT_COLORS) as TshirtColor[]).map((option) => (
                      <button key={option} type="button" onClick={() => setColor(option)} aria-pressed={color === option} aria-label={TSHIRT_COLORS[option].name} className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${color === option ? 'border-sky-700 ring-2 ring-sky-700 ring-offset-2' : 'border-slate-300'}`} style={{ background: TSHIRT_COLORS[option].hex }}>
                        {color === option && <CheckCircle2 className={`h-5 w-5 ${option === 'zwart' ? 'text-white' : 'text-slate-900'}`} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Maten */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700">Maten en aantallen</p>
                  <div className="grid grid-cols-5 gap-2">
                    {TSHIRT_SIZES.map((size) => (
                      <div key={size} className={`rounded-xl border-2 p-1.5 text-center ${(sizes[size] || 0) > 0 ? 'border-slate-900' : 'border-slate-200'}`}>
                        <p className="text-sm font-extrabold">{size}</p>
                        <input type="number" inputMode="numeric" min="0" max="999" value={sizes[size] || 0} onChange={(event) => setSize(size, Number(event.target.value))} aria-label={`Aantal maat ${size}`} className="mt-1 w-full rounded-md border border-slate-200 py-1 text-center text-sm font-bold tabular-nums" />
                        <div className="mt-1 flex justify-center gap-1">
                          <button type="button" aria-label={`Maat ${size} min één`} onClick={() => setSize(size, (sizes[size] || 0) - 1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200"><Minus className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label={`Maat ${size} plus één`} onClick={() => setSize(size, (sizes[size] || 0) + 1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <input type="checkbox" checked={designFee} onChange={(event) => setDesignFee(event.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e31c24]" />
                  <span><strong>Ontwerp laten opmaken</strong> door FD Printing (+{money(TSHIRT_DESIGN_FEE)} per bestelling). Kies dit als uw bestand nog aangepast moet worden.</span>
                </label>

                {/* Prijs */}
                <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                  {price.valid ? (
                    <>
                      <ul className="space-y-1 text-xs text-slate-600">
                        {price.lines.map((line) => <li key={line.label} className="flex justify-between gap-2"><span>{line.label}</span><span className="tabular-nums">{money(line.amount)}</span></li>)}
                      </ul>
                      <p className="flex items-baseline justify-between border-t border-slate-200 pt-2 text-sm"><span className="font-bold">{quantity} {quantity === 1 ? 'shirt' : 'shirts'} · {money(price.perShirt)} per stuk</span><span className="text-xs text-slate-500">incl. btw</span></p>
                      {nextTier && <p className="text-[11px] font-semibold text-sky-800">Vanaf {nextTier.count} shirts betaalt u {money(nextTier.perShirt)} per stuk.</p>}
                    </>
                  ) : <p className="text-xs text-slate-500">{price.warning}</p>}
                </div>

                <button type="button" disabled={!canContinue} onClick={() => { setSelectedId(null); setStep('details'); }} className="flex min-h-[56px] w-full items-center justify-between rounded-2xl bg-gradient-to-r from-[#e31c24] to-[#b8141a] px-6 text-lg font-extrabold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
                  <span>Bestellen</span>
                  <span className="tabular-nums">{money(price.valid ? price.total : 0)}</span>
                </button>
              </>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <button type="button" onClick={() => setStep('design')} className="text-xs font-bold text-slate-500 hover:text-slate-900">&larr; Terug naar ontwerp</button>
                <h1 className="text-2xl font-black tracking-tight">Uw gegevens</h1>
                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-bold">{price.description}</p>
                  <p className="mt-1">Totaal <strong>{money(price.total)}</strong> incl. btw · betalen bij ophalen</p>
                </div>
                <label className="block space-y-1 text-sm font-bold text-slate-700">Naam<input required value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} className={inputClass} autoComplete="name" /></label>
                <label className="block space-y-1 text-sm font-bold text-slate-700">E-mailadres<input required type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} className={inputClass} autoComplete="email" /></label>
                <label className="block space-y-1 text-sm font-bold text-slate-700">Telefoonnummer<input required type="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} className={inputClass} autoComplete="tel" /></label>
                <label className="block space-y-1 text-sm font-bold text-slate-700">Ophalen bij filiaal
                  <select required value={customer.branch} onChange={(event) => setCustomer({ ...customer, branch: event.target.value })} className={inputClass}>
                    <option value="">Kies een filiaal</option>
                    {Object.keys(BRANCH_DETAILS).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-sm font-bold text-slate-700">Opmerkingen (optioneel)<textarea value={customer.comments} maxLength={2000} onChange={(event) => setCustomer({ ...customer, comments: event.target.value })} rows={3} className={`${inputClass} py-2`} /></label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 accent-[#e31c24]" />
                  <span>Ik bevestig dat ik deze afbeelding(en) mag gebruiken en dat er geen rechten van anderen (zoals logo's of merken) worden geschonden.</span>
                </label>
                {submitError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{submitError}</p>}
                <button type="submit" disabled={submitting} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#e31c24] px-6 text-lg font-extrabold text-white hover:bg-[#b8141a] disabled:opacity-60">
                  {submitting && <Loader2 className="h-5 w-5 animate-spin" />} Bestelling plaatsen
                </button>
              </form>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
