import React, { useMemo } from 'react';
import { Shirt } from 'lucide-react';
import { TSHIRT_COLORS, TSHIRT_FORMATS, TshirtSide, TshirtSpec, sizesSummary } from '../../utils/tshirtPricing';
import { TshirtMockup } from './TshirtMockup';

const money = (value: number) => `€ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

/** T-shirtgegevens bij een online bestelling in het backoffice: kleur, maten, prints, prijs en proefbeeld. */
export function TshirtOrderBox({ order }: { order: Record<string, any> }) {
  const data = useMemo(() => {
    try {
      return JSON.parse(String(order.tshirt_json)) as { spec: TshirtSpec; sides: Record<string, any>; total: number; perShirt: number; source: string };
    } catch {
      return null;
    }
  }, [order.tshirt_json]);
  if (!data?.spec) return null;
  const { spec, sides } = data;
  // A-zijde = eerste bedrukte kant, B-zijde = tweede.
  const imageFor = (side: TshirtSide) => {
    const index = spec.prints.findIndex((print) => print.side === side);
    return index === 0 ? order.imageSrcUrl : index === 1 ? order.backImageSrcUrl : undefined;
  };
  return (
    <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-sky-800"><Shirt className="h-3.5 w-3.5" /> T-shirt DTF</span>
      <p className="font-extrabold text-slate-800">{TSHIRT_COLORS[spec.color]?.name} korte mouw · {sizesSummary(spec.sizes)}</p>
      <ul className="space-y-0.5 text-slate-700">
        {spec.prints.map((print) => {
          const side = sides?.[print.side] || {};
          return (
            <li key={print.side}>
              <strong>{print.side === 'voor' ? 'Voorkant' : 'Achterkant'}</strong>: {TSHIRT_FORMATS[print.format].short}
              {side.printedWidthMm ? ` · print ${Math.round(side.printedWidthMm / 10)} × ${Math.round(side.printedHeightMm / 10)} cm` : ''}
              {side.dpi ? ` · ${side.dpi} dpi` : ''}
              {side.check && side.check !== 'ok' && <span className={`ml-1 rounded px-1 text-[10px] font-bold ${side.check === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{side.check === 'error' ? 'controle nodig' : 'let op'}</span>}
              {Array.isArray(side.checkNotes) && side.checkNotes.length > 0 && <span className="block text-[10px] text-slate-500">{side.checkNotes.join(' ')}</span>}
            </li>
          );
        })}
      </ul>
      {spec.designFee && <p className="text-[11px] font-semibold text-slate-700">Klant wil het ontwerp laten opmaken (opmaakkosten).</p>}
      <p className="text-slate-700">Totaal <strong>{money(data.total)}</strong> incl. btw ({money(data.perShirt)} per shirt)</p>
      <div className="grid grid-cols-2 gap-2">
        {spec.prints.map((print) => {
          const side = sides?.[print.side] || {};
          return (
            <figure key={print.side} className="rounded-lg bg-white p-1">
              <TshirtMockup
                color={spec.color}
                side={print.side}
                format={print.format}
                imageUrl={imageFor(print.side)}
                imageWidth={side.pixelWidth}
                imageHeight={side.pixelHeight}
                placement={{ scale: side.scale || 1, offsetX: side.offsetX ?? 0.5, offsetY: side.offsetY ?? 0 }}
                showGuide={false}
                className="w-full"
              />
              <figcaption className="text-center text-[10px] font-bold text-slate-500">Proef {print.side === 'voor' ? 'voorkant' : 'achterkant'}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
