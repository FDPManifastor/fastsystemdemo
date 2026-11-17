import React, { useState } from 'react';
import { Calculator, Image as ImageIcon, PanelTop, Shirt, Sticker, X } from 'lucide-react';
import { POSTER_FORMATS, calculatePoster } from '../../utils/pricing';
import { PriceCalculatorPanel } from './TicketTools';
import { TshirtCalculatorPanel } from '../tshirt/TshirtCalculatorPanel';

/** Producten waarvan formaat en aantal speciaal zijn en die met een eigen calculator op de bon komen. */
export type CustomKind = 'sticker' | 'banner' | 'poster' | 'tshirt';

export const CUSTOM_PRODUCTS: Array<{ kind: CustomKind; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { kind: 'sticker', label: 'Vinyl stickers', hint: 'Eigen formaat, rond of recht', icon: Sticker },
  { kind: 'banner', label: 'Banner', hint: 'PVC of roll-up', icon: PanelTop },
  { kind: 'poster', label: 'Poster', hint: 'A2 t/m A0, B2, B1', icon: ImageIcon },
  { kind: 'tshirt', label: 'T-shirt (DTF)', hint: 'Kleur, maten, opdrukken', icon: Shirt },
];

/** Wat een calculator teruggeeft om in een regel van de bon te zetten (bedragen incl. btw). */
export interface CustomApplied {
  description: string;
  category: string;
  widthMm: number;
  heightMm: number;
  printSides: 'single' | 'double';
  quantity: number;
  total: number;
  source: string;
}

export function CustomProductMenu({ onPick, onClose }: { onPick: (kind: CustomKind) => void; onClose: () => void }) {
  return (
    <div className="col-span-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Customised product toevoegen</p>
        <button type="button" onClick={onClose} aria-label="Sluiten" className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CUSTOM_PRODUCTS.map(({ kind, label, hint, icon: Icon }) => (
          <button key={kind} type="button" onClick={() => onPick(kind)} className="flex min-h-[72px] flex-col items-start justify-center gap-1 rounded-xl border-2 border-slate-200 px-3 py-2 text-left hover:border-slate-900 hover:bg-slate-50">
            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Icon className="h-4 w-4 text-[#e31c24]" /> {label}</span>
            <span className="text-[11px] text-slate-500">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const chip = (active: boolean) => `min-h-[40px] rounded-lg border px-3 text-xs font-extrabold ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;
const money = (value: number) => `€ ${value.toFixed(2).replace('.', ',')}`;

function PosterCalculatorPanel({ onApply, onClose }: { onApply: (applied: CustomApplied) => void; onClose: () => void }) {
  const [formatId, setFormatId] = useState<string>('A1');
  const [color, setColor] = useState(true);
  const [quantity, setQuantity] = useState('1');
  const result = calculatePoster({ formatId, color, quantity: Number(quantity) });
  return (
    <div className="col-span-full rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-[#e31c24]" />
          <h4 className="text-sm font-extrabold text-slate-900">Poster berekenen</h4>
        </div>
        <button type="button" onClick={onClose} aria-label="Calculator sluiten" className="rounded-md p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {POSTER_FORMATS.map((format) => <button key={format.id} type="button" className={chip(formatId === format.id)} onClick={() => setFormatId(format.id)}>{format.id}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={chip(color)} onClick={() => setColor(true)}>Kleur</button>
            <button type="button" className={chip(!color)} onClick={() => setColor(false)}>Zwart-wit</button>
            <label className="ml-2 flex items-center gap-2 text-xs font-bold text-slate-600">
              Aantal
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="min-h-[40px] w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold tabular-nums" />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">Prijzen per stuk uit FDPBRAIN (posters). A3 en kleiner via de selfservice-staffel onder "Product berekenen".</p>
        </div>
        <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3">
          {result.valid ? (
            <>
              <p className="text-xs text-slate-600">{quantity} × {money(result.unitPrice)}</p>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-bold text-slate-900">Totaal incl. btw</span>
                <span className="text-xl font-extrabold tabular-nums text-slate-900">{money(result.total)}</span>
              </div>
            </>
          ) : <p className="text-xs text-slate-500">{result.warning}</p>}
          <button
            type="button"
            disabled={!result.valid}
            onClick={() => result.valid && onApply({ description: result.description, category: 'Poster', widthMm: result.format.widthMm, heightMm: result.format.heightMm, printSides: 'single', quantity: Number(quantity), total: result.total, source: result.source })}
            className="mt-3 rounded-lg bg-[#e31c24] px-3 py-2 text-xs font-bold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Overnemen in regel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Opent de calculator voor het gekozen customised product en geeft een bonregel terug. */
export function CustomProductPanel({ kind, onApply, onClose }: { kind: CustomKind; onApply: (applied: CustomApplied) => void; onClose: () => void }) {
  if (kind === 'tshirt') {
    return (
      <TshirtCalculatorPanel
        onClose={onClose}
        onApply={(applied) => onApply({ description: applied.result.description, category: 'T-shirt', widthMm: applied.widthMm, heightMm: applied.heightMm, printSides: applied.printSides, quantity: applied.quantity, total: applied.result.total, source: applied.result.source })}
      />
    );
  }
  if (kind === 'poster') return <PosterCalculatorPanel onApply={onApply} onClose={onClose} />;
  return (
    <PriceCalculatorPanel
      initialKind={kind}
      lockKind
      onClose={onClose}
      onApply={(applied) => onApply({ description: applied.result.description, category: applied.kind === 'sticker' ? 'Sticker' : 'Banner', widthMm: applied.widthMm, heightMm: applied.heightMm, printSides: 'single', quantity: applied.quantity, total: applied.result.total, source: applied.result.source })}
    />
  );
}
