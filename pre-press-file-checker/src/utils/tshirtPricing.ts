/**
 * T-shirt bedrukking (DTF) – prijzen en berekening.
 *
 * Bron: FDPBRAIN → Calculators → "T-shirt bedrukking DTF – staffelprijzen" (17-11-2026).
 * - Bedrukkingsprijzen zijn per print, inclusief 21% btw en exclusief T-shirt.
 * - De staffel hangt af van het totaal aantal shirts in de bestelling (alle maten samen).
 * - Shirts (korte mouw) komen uit de productendatabase: wit € 3,95, zwart € 4,95.
 *
 * Dit bestand wordt door zowel de browser als de server gebruikt (de server rekent de prijs na).
 */

export type TshirtColor = 'wit' | 'zwart';
export type TshirtSide = 'voor' | 'achter';
export type TshirtFormat = 'klein' | 'a4' | 'a3';

export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type TshirtSize = (typeof TSHIRT_SIZES)[number];

export const TSHIRT_COLORS: Record<TshirtColor, { name: string; price: number; sku: string; hex: string }> = {
  wit: { name: 'Wit', price: 3.95, sku: '210000001308', hex: '#ffffff' },
  zwart: { name: 'Zwart', price: 4.95, sku: '210000001309', hex: '#16171b' },
};

/** Printformaten met maximale afmeting op het shirt (mm). */
export const TSHIRT_FORMATS: Record<TshirtFormat, { name: string; short: string; widthMm: number; heightMm: number }> = {
  klein: { name: 'Klein logo 10 × 10 cm (borst/mouw)', short: '10×10 cm', widthMm: 100, heightMm: 100 },
  a4: { name: 'A4 21 × 30 cm', short: 'A4', widthMm: 210, heightMm: 300 },
  a3: { name: 'A3 30 × 42 cm', short: 'A3', widthMm: 300, heightMm: 420 },
};

/** Staffel per print (incl. btw, excl. shirt). */
export const TSHIRT_TIERS = [
  { min: 1, max: 4, label: '1–4 st' },
  { min: 5, max: 24, label: '5–24 st' },
  { min: 25, max: Infinity, label: '25+ st' },
] as const;

export const TSHIRT_PRINT_PRICES: Record<TshirtFormat, [number, number, number]> = {
  klein: [8.5, 4.5, 1.95],
  a4: [13.5, 8.5, 4.5],
  a3: [16.5, 10.75, 5.95],
};

/** Textiel opmaakkosten (SKU 10009): alleen als FD het ontwerp opmaakt. */
export const TSHIRT_DESIGN_FEE = 15;
export const TSHIRT_MAX_QUANTITY = 1000;

export interface TshirtPrint {
  side: TshirtSide;
  format: TshirtFormat;
}

export interface TshirtSpec {
  color: TshirtColor;
  sizes: Partial<Record<TshirtSize, number>>;
  prints: TshirtPrint[];
  /** Klant levert eigen shirts aan: alleen bedrukking. */
  ownShirts?: boolean;
  /** FD maakt het ontwerp op (textiel opmaakkosten). */
  designFee?: boolean;
}

export interface TshirtPriceResult {
  valid: boolean;
  warning: string;
  quantity: number;
  tierIndex: number;
  perShirt: number;
  lines: Array<{ label: string; amount: number }>;
  /** Totaal inclusief btw. */
  total: number;
  description: string;
  source: string;
}

const round2 = (value: number) => Math.round((value + 1e-9) * 100) / 100;
const euro = (value: number) => `€ ${value.toFixed(2).replace('.', ',')}`;

export function tshirtQuantity(sizes: TshirtSpec['sizes']) {
  return TSHIRT_SIZES.reduce((sum, size) => sum + (Number(sizes[size]) || 0), 0);
}

export function tshirtTierIndex(quantity: number) {
  const index = TSHIRT_TIERS.findIndex((tier) => quantity >= tier.min && quantity <= tier.max);
  return index < 0 ? 0 : index;
}

export function sizesSummary(sizes: TshirtSpec['sizes']) {
  return TSHIRT_SIZES.filter((size) => (Number(sizes[size]) || 0) > 0).map((size) => `${size}×${sizes[size]}`).join(', ');
}

export function printsSummary(prints: TshirtPrint[]) {
  return prints.map((print) => `${print.side === 'voor' ? 'voor' : 'achter'} ${TSHIRT_FORMATS[print.format].short}`).join(' + ');
}

export function calculateTshirtPrice(spec: TshirtSpec): TshirtPriceResult {
  const quantity = tshirtQuantity(spec.sizes);
  const empty: TshirtPriceResult = { valid: false, warning: '', quantity, tierIndex: 0, perShirt: 0, lines: [], total: 0, description: '', source: '' };
  if (!TSHIRT_COLORS[spec.color]) return { ...empty, warning: 'Kies een kleur.' };
  if (quantity <= 0) return { ...empty, warning: 'Vul bij minstens één maat een aantal in.' };
  if (quantity > TSHIRT_MAX_QUANTITY) return { ...empty, warning: `Maximaal ${TSHIRT_MAX_QUANTITY} shirts per bestelling; vraag een offerte aan.` };
  if (spec.prints.length === 0) return { ...empty, warning: 'Kies minstens één bedrukking (voor of achter).' };

  const tierIndex = tshirtTierIndex(quantity);
  const tier = TSHIRT_TIERS[tierIndex];
  const color = TSHIRT_COLORS[spec.color];
  const shirtPrice = spec.ownShirts ? 0 : color.price;
  const printPrices = spec.prints.map((print) => TSHIRT_PRINT_PRICES[print.format][tierIndex]);
  const perShirt = round2(shirtPrice + printPrices.reduce((sum, price) => sum + price, 0));
  const designFee = spec.designFee ? TSHIRT_DESIGN_FEE : 0;
  const total = round2(perShirt * quantity + designFee);

  const lines: TshirtPriceResult['lines'] = [];
  if (!spec.ownShirts) lines.push({ label: `T-shirt ${color.name.toLowerCase()} ${quantity} × ${euro(shirtPrice)}`, amount: round2(shirtPrice * quantity) });
  spec.prints.forEach((print, index) => {
    lines.push({
      label: `Print ${print.side === 'voor' ? 'voorkant' : 'achterkant'} ${TSHIRT_FORMATS[print.format].short} ${quantity} × ${euro(printPrices[index])} (${tier.label})`,
      amount: round2(printPrices[index] * quantity),
    });
  });
  if (designFee) lines.push({ label: 'Textiel opmaakkosten', amount: designFee });

  const sizes = sizesSummary(spec.sizes);
  const description = `${spec.ownShirts ? 'Bedrukking eigen shirt' : `T-shirt ${color.name.toLowerCase()} korte mouw`} DTF – ${printsSummary(spec.prints)} – ${sizes}`;
  const source = `T-shirt DTF-staffel · ${tier.label} · ${spec.ownShirts ? 'eigen shirt' : `shirt ${color.name.toLowerCase()} SKU ${color.sku}`} · ${printsSummary(spec.prints)}${designFee ? ' · opmaakkosten' : ''}`;
  return { valid: true, warning: '', quantity, tierIndex, perShirt, lines, total, description, source };
}

/** Controleert en normaliseert een spec die van buiten komt (server). Geeft null bij ongeldige invoer. */
export function parseTshirtSpec(value: unknown): TshirtSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, any>;
  if (raw.color !== 'wit' && raw.color !== 'zwart') return null;
  if (!raw.sizes || typeof raw.sizes !== 'object' || Array.isArray(raw.sizes)) return null;
  const sizes: TshirtSpec['sizes'] = {};
  for (const size of TSHIRT_SIZES) {
    const count = raw.sizes[size];
    if (count === undefined || count === 0) continue;
    if (!Number.isInteger(count) || count < 0 || count > TSHIRT_MAX_QUANTITY) return null;
    sizes[size] = count;
  }
  if (Object.keys(raw.sizes).some((key) => !(TSHIRT_SIZES as readonly string[]).includes(key))) return null;
  if (!Array.isArray(raw.prints) || raw.prints.length < 1 || raw.prints.length > 2) return null;
  const prints: TshirtPrint[] = [];
  for (const print of raw.prints) {
    if (!print || (print.side !== 'voor' && print.side !== 'achter') || !(print.format in TSHIRT_FORMATS)) return null;
    if (prints.some((existing) => existing.side === print.side)) return null;
    prints.push({ side: print.side, format: print.format });
  }
  const quantity = tshirtQuantity(sizes);
  if (quantity < 1 || quantity > TSHIRT_MAX_QUANTITY) return null;
  return { color: raw.color, sizes, prints, ownShirts: raw.ownShirts === true, designFee: raw.designFee === true };
}
