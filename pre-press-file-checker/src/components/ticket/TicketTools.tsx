import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle, FileText, RotateCw, X } from 'lucide-react';
import LiveFilePreview from '../LiveFilePreview';
import { renderPdfFile } from '../../utils/pdfLoader';
import type { FitMode, PrintProduct } from '../../types';
import {
  BANNER_MATERIALS,
  BANNER_PRESETS,
  CASSETTES,
  CalculatorKind,
  CalculatorResult,
  CatalogProduct,
  STICKER_MATERIALS,
  STICKER_PRESETS,
  calculatePrice,
  searchCatalog,
} from '../../utils/pricing';

const money = (value: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '20 MB';

export function getUploadFileType(file: File) {
  if (['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return '';
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Het bestand kon niet worden gelezen.')));
    reader.onerror = () => reject(new Error('Het bestand kon niet worden gelezen.'));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Productcatalogus uit Notion                                          */
/* ------------------------------------------------------------------ */

export interface CatalogState {
  products: CatalogProduct[];
  loading: boolean;
  configured: boolean;
  syncedAt: string | null;
  error: string;
}

let catalogPromise: Promise<CatalogState> | null = null;

function fetchCatalog(): Promise<CatalogState> {
  if (!catalogPromise) {
    catalogPromise = fetch('/api/catalog', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('De productcatalogus kon niet worden geladen.');
        const body = await response.json();
        return {
          products: Array.isArray(body.products) ? body.products : [],
          loading: false,
          configured: Boolean(body.configured),
          syncedAt: body.syncedAt || null,
          error: body.error || '',
        };
      })
      .catch((error) => {
        catalogPromise = null;
        return { products: [], loading: false, configured: false, syncedAt: null, error: error instanceof Error ? error.message : 'Fout' };
      });
  }
  return catalogPromise;
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ products: [], loading: true, configured: false, syncedAt: null, error: '' });
  useEffect(() => {
    let active = true;
    fetchCatalog().then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onPick: (product: CatalogProduct) => void;
  products: CatalogProduct[];
  className: string;
  ariaLabel: string;
  placeholder?: string;
}

/** Omschrijvingsveld dat tijdens het typen passende producten met prijs voorstelt. */
export function ProductSearchInput({ value, onChange, onPick, products, className, ariaLabel, placeholder }: ProductSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | undefined>(undefined);
  const matches = useMemo(() => (open ? searchCatalog(products, value, 8) : []), [open, products, value]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);
  useEffect(() => setActive(0), [value]);

  const pick = (product: CatalogProduct) => {
    onPick(product);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        required
        maxLength={2000}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(event) => {
          if (!open || matches.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (current + 1) % matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(matches[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {matches.map((product, index) => (
            <li key={`${product.sku}-${product.name}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(product)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left ${index === active ? 'bg-rose-50' : 'bg-white'}`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-slate-900">{product.name}</span>
                  <span className="block text-[11px] text-slate-500">{[product.category, product.sku && `SKU ${product.sku}`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${product.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                  {product.price > 0 ? money(product.price) : 'geen prijs'}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">Prijzen incl. btw uit FDPBRAIN (Notion) · ↑↓ en Enter om te kiezen</li>
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sticker- en bannercalculator                                         */
/* ------------------------------------------------------------------ */

export interface CalculatorApplied {
  kind: CalculatorKind;
  result: CalculatorResult;
  widthMm: number;
  heightMm: number;
  quantity: number;
}

const calcInput = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]';

export function PriceCalculatorPanel({ initialKind = 'sticker', lockKind = false, onApply, onClose }: { initialKind?: CalculatorKind; lockKind?: boolean; onApply: (applied: CalculatorApplied) => void; onClose: () => void }) {
  const [kind, setKind] = useState<CalculatorKind>(initialKind);
  const [stickerMaterial, setStickerMaterial] = useState<string>(STICKER_MATERIALS[0].id);
  const [bannerMaterial, setBannerMaterial] = useState<string>(BANNER_MATERIALS[0].id);
  const [cassette, setCassette] = useState<string>('none');
  const [width, setWidth] = useState('5');
  const [height, setHeight] = useState('5');
  const [quantity, setQuantity] = useState('100');
  const [round, setRound] = useState(false);

  const parse = (text: string) => Number(text.replace(',', '.'));
  const rollUp = BANNER_MATERIALS.find((entry) => entry.id === bannerMaterial)?.rollUp ?? false;
  const result = useMemo(() => calculatePrice({
    kind,
    materialId: kind === 'sticker' ? stickerMaterial : bannerMaterial,
    widthCm: parse(width),
    heightCm: round && kind === 'sticker' ? parse(width) : parse(height),
    quantity: Number(quantity),
    round,
    cassetteId: cassette,
  }), [kind, stickerMaterial, bannerMaterial, width, height, quantity, round, cassette]);

  const switchKind = (next: CalculatorKind) => {
    setKind(next);
    if (next === 'banner') {
      setWidth('100');
      setHeight('100');
      setQuantity('1');
      setRound(false);
    } else {
      setWidth('5');
      setHeight('5');
      setQuantity('100');
    }
  };

  const presets = kind === 'sticker' ? STICKER_PRESETS : BANNER_PRESETS;

  return (
    <div className="col-span-full rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-[#e31c24]" />
          <h4 className="text-sm font-extrabold text-slate-900">{lockKind ? (kind === 'banner' ? 'Banner berekenen' : 'Stickers: formaat en prijs berekenen') : 'Prijscalculator'}</h4>
          {!lockKind && <div className="ml-2 flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['sticker', 'banner'] as const).map((option) => (
              <button key={option} type="button" onClick={() => switchKind(option)} aria-pressed={kind === option} className={`rounded-md px-3 py-1 text-xs font-bold ${kind === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {option === 'sticker' ? 'Stickers' : 'Banners'}
              </button>
            ))}
          </div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Calculator sluiten" className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Materiaal</span>
              {kind === 'sticker' ? (
                <select value={stickerMaterial} onChange={(event) => setStickerMaterial(event.target.value)} className={calcInput}>
                  {STICKER_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name} · € {material.ratePerM2}/m²</option>)}
                </select>
              ) : (
                <select value={bannerMaterial} onChange={(event) => { setBannerMaterial(event.target.value); setCassette('none'); }} className={calcInput}>
                  {BANNER_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                </select>
              )}
            </label>
            {kind === 'banner' && rollUp && (
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Roll-up cassette</span>
                <select value={cassette} onChange={(event) => setCassette(event.target.value)} className={calcInput}>
                  {CASSETTES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.price ? ` · ${money(entry.price)}` : ''}</option>)}
                </select>
              </label>
            )}
            {kind === 'sticker' && (
              <label className="flex items-center gap-2 self-end rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={round} onChange={(event) => setRound(event.target.checked)} className="h-4 w-4 accent-[#e31c24]" />
                Ronde sticker
              </label>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500">{round && kind === 'sticker' ? 'Diameter (cm)' : 'Breedte (cm)'}</span>
              <input inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} className={`${calcInput} tabular-nums`} />
            </label>
            {!(round && kind === 'sticker') && (
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Hoogte (cm)</span>
                <input inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} className={`${calcInput} tabular-nums`} />
              </label>
            )}
            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Aantal</span>
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={`${calcInput} tabular-nums`} />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setWidth(String(preset.width).replace('.', ','));
                  setHeight(String(preset.height).replace('.', ','));
                  if ('round' in preset) setRound(Boolean(preset.round));
                }}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-500"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3">
          {result.valid ? (
            <>
              <ul className="space-y-1 text-xs text-slate-600">
                {result.lines.map((line) => (
                  <li key={line.label} className="flex justify-between gap-2">
                    <span>{line.label}</span>
                    <span className="shrink-0 tabular-nums">{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-bold text-slate-900">Totaal incl. btw</span>
                <span className="text-xl font-extrabold tabular-nums text-slate-900">{money(result.total)}</span>
              </div>
              <p className="text-right text-[10px] text-slate-500">excl. btw {money(result.total / 1.21)}</p>
            </>
          ) : (
            <p className="text-xs text-slate-500">{result.warning}</p>
          )}
          {result.valid && result.warning && <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] font-medium text-amber-800">{result.warning}</p>}
          <button
            type="button"
            disabled={!result.valid}
            onClick={() => onApply({
              kind,
              result,
              widthMm: Math.round(parse(width) * 10),
              heightMm: Math.round((round && kind === 'sticker' ? parse(width) : parse(height)) * 10),
              quantity: Number(quantity),
            })}
            className="mt-3 rounded-lg bg-[#e31c24] px-3 py-2 text-xs font-bold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Overnemen in regel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bestandsvoorbeeld (miniatuur) en pre-press check                     */
/* ------------------------------------------------------------------ */

export interface FilePreview {
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  isPdf: boolean;
  /** Paginaformaat van een pdf in mm. */
  pageWidthMm?: number;
  pageHeightMm?: number;
  pageCount?: number;
}

export async function loadFilePreview(file: File): Promise<FilePreview> {
  if (getUploadFileType(file) === 'application/pdf') {
    const rendered = await renderPdfFile(file, 1);
    const page = rendered.pages[0];
    return { url: page.dataUrl, pixelWidth: page.width, pixelHeight: page.height, isPdf: true, pageWidthMm: rendered.widthMm, pageHeightMm: rendered.heightMm, pageCount: rendered.pageCount };
  }
  const url = await readFileAsDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('De afbeelding kon niet worden geladen.'));
    image.src = url;
  });
  return { url, pixelWidth: image.naturalWidth, pixelHeight: image.naturalHeight, isPdf: false };
}

/** Miniatuur van een bestand: lokaal gekozen (file) of al geüpload (remoteUrl). */
export function FileThumb({ file, remoteUrl, fileName, fileType, size = 44 }: { file?: File | null; remoteUrl?: string; fileName?: string; fileType?: string; size?: number }) {
  const [preview, setPreview] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setPreview('');
    setFailed(false);
    (async () => {
      try {
        let source = file ?? null;
        if (!source && remoteUrl) {
          const response = await fetch(remoteUrl, { credentials: 'include' });
          if (!response.ok) throw new Error('Bestand niet beschikbaar');
          const blob = await response.blob();
          source = new File([blob], fileName || 'bestand', { type: fileType || blob.type });
        }
        if (!source) return;
        const loaded = await loadFilePreview(source);
        if (active) setPreview(loaded.url);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [file, remoteUrl, fileName, fileType]);

  const box = { width: size, height: size };
  if (preview) return <img src={preview} alt={fileName ? `Voorbeeld van ${fileName}` : 'Voorbeeld van het bestand'} style={box} className="shrink-0 rounded border border-slate-300 bg-white object-contain" />;
  return (
    <span style={box} className={`flex shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-100 text-slate-400 ${failed ? '' : 'animate-pulse'}`}>
      <FileText className="h-5 w-5" />
    </span>
  );
}

export interface PrepressOutcome {
  ok: boolean;
  note: string;
  /** Printklaar bestand (eindformaat + afloop) dat het origineel vervangt. */
  file?: File;
}

interface PrepressModalProps {
  file: File;
  description: string;
  category: string;
  widthMm: number;
  heightMm: number;
  onClose: () => void;
  onDone: (outcome: PrepressOutcome) => void;
}

/** Pre-press check: plaatst het bestand in het productkader (bestaande preflight-weergave) en controleert formaat en resolutie. */
export function TicketPrepressModal({ file, description, category, widthMm, heightMm, onClose, onDone }: PrepressModalProps) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState('');
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [rotation, setRotation] = useState(0);
  const [bleed, setBleed] = useState('2');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadFilePreview(file)
      .then((loaded) => {
        if (active) setPreview(loaded);
      })
      .catch(() => {
        if (active) setError('Het bestand kon niet worden geopend voor de pre-press check.');
      });
    return () => {
      active = false;
    };
  }, [file]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isSticker = category === 'Sticker';
  const product: PrintProduct = {
    id: 'ticket-line',
    name: description || 'Product',
    category: (['Flyer', 'Poster', 'Sticker', 'Banner', 'Visitekaart'].includes(category) ? category : 'Flyer') as PrintProduct['category'],
    widthMm,
    heightMm,
    iconName: 'file-text',
  };

  const checks = useMemo(() => {
    if (!preview) return [];
    const rotated = rotation === 90 || rotation === 270;
    const pixelW = rotated ? preview.pixelHeight : preview.pixelWidth;
    const pixelH = rotated ? preview.pixelWidth : preview.pixelHeight;
    const fileRatio = pixelW / pixelH;
    const targetRatio = widthMm / heightMm;
    const ratioOk = Math.abs(fileRatio - targetRatio) <= 0.08;
    const list: Array<{ ok: boolean; warn?: boolean; label: string; detail: string }> = [{
      ok: ratioOk,
      label: 'Verhouding',
      detail: ratioOk
        ? 'De verhouding van het bestand past bij het productformaat.'
        : `Het bestand heeft een andere verhouding (${fileRatio.toFixed(2)}) dan het product (${targetRatio.toFixed(2)}). Roteer het bestand, kies "Vullen" of pas het formaat aan.`,
    }];
    if (preview.isPdf && preview.pageWidthMm && preview.pageHeightMm) {
      const pageW = rotated ? preview.pageHeightMm : preview.pageWidthMm;
      const pageH = rotated ? preview.pageWidthMm : preview.pageHeightMm;
      const extraW = pageW - widthMm;
      const extraH = pageH - heightMm;
      const exact = Math.abs(extraW) <= 1 && Math.abs(extraH) <= 1;
      const withBleed = extraW >= 3 && extraW <= 12 && extraH >= 3 && extraH <= 12;
      list.push({
        ok: exact || withBleed,
        warn: exact,
        label: 'Paginaformaat',
        detail: withBleed
          ? `Pdf is ${pageW.toFixed(0)} × ${pageH.toFixed(0)} mm: productformaat met afloop.`
          : exact
            ? `Pdf is ${pageW.toFixed(0)} × ${pageH.toFixed(0)} mm: juiste formaat, maar zonder afloop.`
            : `Pdf is ${pageW.toFixed(0)} × ${pageH.toFixed(0)} mm; het product is ${widthMm} × ${heightMm} mm. Het bestand wordt geschaald.`,
      });
      if ((preview.pageCount ?? 1) > 1) list.push({ ok: true, label: "Pagina's", detail: `De pdf heeft ${preview.pageCount} pagina's; pagina 1 wordt getoond.` });
    } else {
      const dpi = Math.round(pixelW / (widthMm / 25.4));
      list.push({
        ok: dpi >= 240,
        warn: dpi >= 150 && dpi < 240,
        label: 'Resolutie',
        detail: dpi >= 240
          ? `${dpi} DPI op ${widthMm} × ${heightMm} mm: goed voor drukwerk.`
          : `${dpi} DPI op ${widthMm} × ${heightMm} mm. Advies is minimaal 240–300 DPI.`,
      });
    }
    if (isSticker && (widthMm < 30 || heightMm < 30)) {
      list.push({ ok: false, label: 'Stickerformaat', detail: 'Vinyl stickers moeten minimaal 30 × 30 mm zijn.' });
    }
    return list;
  }, [preview, rotation, widthMm, heightMm, isSticker]);

  const allOk = checks.length > 0 && checks.every((check) => check.ok);
  const fitLabel = fitMode === 'fit' ? 'passend' : fitMode === 'fill' ? 'vullend' : 'uitgerekt';
  const noteFor = (processed: boolean, bleedMm = 0) =>
    `${allOk ? 'Gecontroleerd: in orde' : 'Gecontroleerd: aandachtspunten'} · ${fitLabel}${rotation ? ` · ${rotation}° gedraaid` : ''}${processed ? ` · printklaar gemaakt (${widthMm} × ${heightMm} mm + ${bleedMm} mm afloop)` : ''}${checks.filter((check) => !check.ok).map((check) => ` · ${check.label.toLowerCase()} controleren`).join('')}`;

  const applyPrintReady = async () => {
    const bleedMm = Number(bleed.replace(',', '.'));
    if (!Number.isFinite(bleedMm) || bleedMm < 0 || bleedMm > 20) {
      setError('Vul een afloop tussen 0 en 20 mm in.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { buildPrintReadyPdf } = await import('../../utils/printReady');
      const result = await buildPrintReadyPdf(bytes, getUploadFileType(file), { trimWidthMm: widthMm, trimHeightMm: heightMm, bleedMm, fit: fitMode, rotation });
      if (result.byteLength > MAX_UPLOAD_BYTES) {
        setError('Het printklare bestand is groter dan 20 MB. Gebruik het origineel of een kleiner bestand.');
        return;
      }
      const name = `${file.name.replace(/\.[^.]+$/, '')}_printklaar.pdf`;
      onDone({ ok: allOk, note: noteFor(true, bleedMm), file: new File([result as unknown as BlobPart], name, { type: 'application/pdf' }) });
    } catch (applyError) {
      console.error('Printklaar maken mislukt:', applyError);
      setError('Het bestand kon niet op formaat worden gezet. Gebruik het origineel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Pre-press check voor ${description}`} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 sm:p-6">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#e31c24]">Pre-press check</p>
            <h3 className="break-words text-base font-extrabold text-slate-900">{description || 'Product'} · {widthMm} × {heightMm} mm</h3>
            <p className="break-all text-xs text-slate-500">{file.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            {!preview && !error && <div className="h-80 animate-pulse rounded-xl bg-slate-100" aria-label="Bestand wordt geladen" />}
            {preview && (
              <LiveFilePreview
                selectedProduct={product}
                widthMm={widthMm}
                heightMm={heightMm}
                imageSrcUrl={preview.url}
                frontFitMode={fitMode}
                backFitMode="fit"
                onSetFrontFitMode={setFitMode}
                onSetBackFitMode={() => undefined}
                frontRotationDegrees={rotation}
                backRotationDegrees={0}
                activeFocusedSide="front"
                onActiveFocusedSideChange={() => undefined}
                pixelWidth={preview.pixelWidth}
                pixelHeight={preview.pixelHeight}
                stickerShape="rectangle"
                isPdf={preview.isPdf}
                printSides="single"
                activeFileName={file.name}
              />
            )}
          </div>

          <aside className="space-y-3">
            <div className="space-y-2">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Plaatsing in het formaat</span>
              <div className="grid grid-cols-3 gap-1">
                {([['fit', 'Passend'], ['fill', 'Vullen'], ['stretch', 'Uitrekken']] as const).map(([mode, label]) => (
                  <button key={mode} type="button" aria-pressed={fitMode === mode} onClick={() => setFitMode(mode)} className={`rounded-md border px-2 py-1.5 text-xs font-bold ${fitMode === mode ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setRotation((current) => (current + 90) % 360)} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <RotateCw className="h-3.5 w-3.5" /> 90° roteren{rotation ? ` (${rotation}°)` : ''}
              </button>
            </div>

            <ul className="space-y-2">
              {checks.map((check) => (
                <li key={check.label} className={`rounded-lg border p-2.5 text-xs ${check.ok && !check.warn ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : check.ok || check.warn ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
                  <p className="flex items-center gap-1.5 font-bold">
                    {check.ok && !check.warn ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {check.label}
                  </p>
                  <p className="mt-0.5 leading-snug">{check.detail}</p>
                </li>
              ))}
            </ul>

            <label className="block space-y-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500">Afloop (mm)</span>
              <input inputMode="decimal" value={bleed} onChange={(event) => setBleed(event.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
            </label>

            <button type="button" disabled={!preview || busy} onClick={applyPrintReady} className="w-full rounded-lg bg-[#e31c24] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#b8141a] disabled:opacity-50">
              {busy ? 'Bestand wordt gemaakt…' : `Zet op ${widthMm} × ${heightMm} mm en gebruik`}
            </button>
            <button
              type="button"
              disabled={!preview || busy}
              onClick={() => onDone({ ok: allOk, note: noteFor(false) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Origineel gebruiken
            </button>
            <p className="text-[10px] leading-snug text-slate-500">Het bestand wordt als pdf op eindformaat plus afloop gezet, zodat het direct ingeslagen kan worden. De uitkomst komt als notitie bij het product in het backoffice.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
