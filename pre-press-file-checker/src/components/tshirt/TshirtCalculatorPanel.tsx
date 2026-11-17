import React, { useState } from 'react';
import { Calculator, X } from 'lucide-react';
import {
  TSHIRT_COLORS,
  TSHIRT_DESIGN_FEE,
  TSHIRT_FORMATS,
  TSHIRT_SIZES,
  TshirtColor,
  TshirtFormat,
  TshirtPriceResult,
  TshirtSide,
  TshirtSize,
  calculateTshirtPrice,
} from '../../utils/tshirtPricing';

export interface TshirtApplied {
  result: TshirtPriceResult;
  quantity: number;
  widthMm: number;
  heightMm: number;
  printSides: 'single' | 'double';
}

const money = (value: number) => `€ ${value.toFixed(2).replace('.', ',')}`;
const chip = (active: boolean) => `min-h-[40px] rounded-lg border px-3 text-xs font-extrabold ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;

/** T-shirt (DTF) berekenen op de opdrachtbon: kleur, maten, prints per kant en eigen shirt. */
export function TshirtCalculatorPanel({ onApply, onClose }: { onApply: (applied: TshirtApplied) => void; onClose: () => void }) {
  const [color, setColor] = useState<TshirtColor>('wit');
  const [ownShirts, setOwnShirts] = useState(false);
  const [designFee, setDesignFee] = useState(false);
  const [sides, setSides] = useState<Record<TshirtSide, TshirtFormat | null>>({ voor: 'a4', achter: null });
  const [sizes, setSizes] = useState<Partial<Record<TshirtSize, number>>>({});

  const prints = (['voor', 'achter'] as TshirtSide[]).filter((side) => sides[side]).map((side) => ({ side, format: sides[side]! }));
  const result = calculateTshirtPrice({ color, sizes, prints, ownShirts, designFee });
  const formatOptions: Array<TshirtFormat | null> = [null, 'klein', 'a4', 'a3'];

  return (
    <div className="col-span-full rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-[#e31c24]" />
          <h4 className="text-sm font-extrabold text-slate-900">T-shirt (DTF) berekenen</h4>
        </div>
        <button type="button" onClick={onClose} aria-label="Calculator sluiten" className="rounded-md p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[10px] font-bold uppercase text-slate-500">Shirt</span>
            {(Object.keys(TSHIRT_COLORS) as TshirtColor[]).map((option) => (
              <button key={option} type="button" className={chip(!ownShirts && color === option)} onClick={() => { setColor(option); setOwnShirts(false); }}>
                {TSHIRT_COLORS[option].name} · {money(TSHIRT_COLORS[option].price)}
              </button>
            ))}
            <button type="button" className={chip(ownShirts)} onClick={() => setOwnShirts(true)}>Eigen shirt klant</button>
          </div>
          {(['voor', 'achter'] as TshirtSide[]).map((side) => (
            <div key={side} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-[10px] font-bold uppercase text-slate-500">{side === 'voor' ? 'Voorkant' : 'Achterkant'}</span>
              {formatOptions.map((format) => (
                <button key={String(format)} type="button" className={chip(sides[side] === format)} onClick={() => setSides((current) => ({ ...current, [side]: format }))}>
                  {format ? TSHIRT_FORMATS[format].short : 'Geen'}
                </button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            {TSHIRT_SIZES.map((size) => (
              <label key={size} className="space-y-0.5 text-center">
                <span className="block text-[10px] font-bold uppercase text-slate-500">{size}</span>
                <input type="number" min="0" max="999" step="1" value={sizes[size] || ''} placeholder="0" onChange={(event) => setSizes((current) => ({ ...current, [size]: Math.max(0, Math.min(999, Math.round(Number(event.target.value)) || 0)) }))} aria-label={`Aantal maat ${size}`} className="min-h-[40px] w-16 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm font-bold tabular-nums" />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={designFee} onChange={(event) => setDesignFee(event.target.checked)} className="h-4 w-4 accent-[#e31c24]" />
            Ontwerp opmaken (+{money(TSHIRT_DESIGN_FEE)})
          </label>
        </div>

        <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3">
          {result.valid ? (
            <>
              <ul className="space-y-1 text-xs text-slate-600">
                {result.lines.map((line) => (
                  <li key={line.label} className="flex justify-between gap-2"><span>{line.label}</span><span className="shrink-0 tabular-nums">{money(line.amount)}</span></li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-bold text-slate-900">Totaal incl. btw</span>
                <span className="text-xl font-extrabold tabular-nums text-slate-900">{money(result.total)}</span>
              </div>
              <p className="text-right text-[10px] text-slate-500">{money(result.perShirt)} per shirt · {result.quantity} st</p>
            </>
          ) : <p className="text-xs text-slate-500">{result.warning}</p>}
          <button
            type="button"
            disabled={!result.valid}
            onClick={() => {
              const first = TSHIRT_FORMATS[prints[0].format];
              onApply({ result, quantity: result.quantity, widthMm: first.widthMm, heightMm: first.heightMm, printSides: prints.length === 2 ? 'double' : 'single' });
            }}
            className="mt-3 rounded-lg bg-[#e31c24] px-3 py-2 text-xs font-bold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Overnemen in regel
          </button>
          {prints.length === 2 && <p className="mt-2 text-[10px] text-slate-500">Twee ontwerpen? Voeg het bestand voor de achterkant toe via “Extra info en bijlagen” in het backoffice.</p>}
        </div>
      </div>
    </div>
  );
}
