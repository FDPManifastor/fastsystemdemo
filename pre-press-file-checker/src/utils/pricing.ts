/**
 * Prijslogica voor de opdrachtbon.
 *
 * - Zoeken in de productcatalogus uit Notion (FDPBRAIN → Producten Database).
 * - Sticker- en bannercalculator: dezelfde tarieven en formules als de
 *   "Printcalculatoren" (Roland SG3-540) in FDPBRAIN → Calculators.
 *   Alle bedragen zijn inclusief 21% btw.
 */

export interface CatalogProduct {
  name: string;
  sku: string;
  category: string;
  variants: string[];
  price: number;
  vat: number;
  keywords: string;
}

/* ------------------------------ Zoeken ------------------------------ */

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](\d{3})\b/g, '$1$2')
    .replace(/(\d+)\s*(gr|grams|gram|g)\b/g, '$1gr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type IndexedProduct = { product: CatalogProduct; text: string; words: string[] };
const indexCache = new WeakMap<CatalogProduct[], IndexedProduct[]>();

function indexOf(products: CatalogProduct[]) {
  let index = indexCache.get(products);
  if (!index) {
    index = products.map((product) => {
      const text = normalize(`${product.name} ${product.category} ${product.keywords} ${product.sku}`);
      return { product, text, words: text.split(' ') };
    });
    indexCache.set(products, index);
  }
  return index;
}

/** Zoekt producten die in de buurt komen van wat er getypt is; beste treffers eerst. */
export function searchCatalog(products: CatalogProduct[], query: string, limit = 8): CatalogProduct[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.join('').length < 2) return [];

  const scored: Array<{ product: CatalogProduct; score: number }> = [];
  for (const entry of indexOf(products)) {
    let matched = 0;
    let score = 0;
    for (const token of tokens) {
      if (entry.words.includes(token)) {
        matched += 1;
        score += 3;
      } else if (entry.words.some((word) => word.startsWith(token))) {
        matched += 1;
        score += 2;
      } else if (token.length >= 3 && entry.text.includes(token)) {
        matched += 1;
        score += 1;
      }
    }
    // Minstens de helft van de getypte woorden moet terugkomen, zodat ook varianten "in de buurt" verschijnen.
    if (matched === 0 || matched < Math.ceil(tokens.length / 2)) continue;
    score += matched === tokens.length ? 4 : 0;
    score += entry.product.price > 0 ? 1.5 : -2;
    score -= entry.words.length * 0.02;
    scored.push({ product: entry.product, score });
  }
  scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'nl', { numeric: true }));
  return scored.slice(0, limit).map((entry) => entry.product);
}

/* ---------------------------- Calculatoren ---------------------------- */

export type CalculatorKind = 'sticker' | 'banner';

export const STICKER_MATERIALS = [
  { id: 'vinyl-glans', name: 'Vinyl sticker permanent glans', ratePerM2: 70 },
  { id: 'transparant', name: 'Transparant sticker', ratePerM2: 80 },
] as const;

export const BANNER_MATERIALS = [
  { id: 'pvc-440', name: 'PVC Banner 440g', ratePerM2: 38.23529411764706, rollUp: false },
  { id: 'rollup-film', name: 'Vinyl Banner (roll-up film)', ratePerM2: 38.23529411764706, rollUp: true },
] as const;

/** Roll-up cassettes: verkoopprijs per stuk incl. btw (850 = vaste prijs, overige inkoop × 1,8 × btw). */
export const CASSETTES = [
  { id: 'none', name: 'Geen cassette', widthCm: 0, price: 0 },
  { id: '800', name: 'Roll-up cassette 80 cm', widthCm: 80, price: 16 * 1.8 * 1.21 },
  { id: '850', name: 'Roll-up cassette 85 cm', widthCm: 85, price: 20 },
  { id: '1000', name: 'Roll-up cassette 100 cm', widthCm: 100, price: 20.5 * 1.8 * 1.21 },
] as const;

export const STICKER_PRESETS = [
  { label: 'Ø 3 cm', width: 3, height: 3, round: true },
  { label: 'Ø 5 cm', width: 5, height: 5, round: true },
  { label: 'Ø 7 cm', width: 7, height: 7, round: true },
  { label: 'Ø 9 cm', width: 9, height: 9, round: true },
  { label: 'Ø 10 cm', width: 10, height: 10, round: true },
  { label: '4 × 4 cm', width: 4, height: 4, round: false },
  { label: '5 × 5 cm', width: 5, height: 5, round: false },
  { label: '6 × 6 cm', width: 6, height: 6, round: false },
  { label: '8 × 8 cm', width: 8, height: 8, round: false },
  { label: '10 × 10 cm', width: 10, height: 10, round: false },
  { label: '5 × 10 cm', width: 5, height: 10, round: false },
  { label: '7 × 10 cm', width: 7, height: 10, round: false },
  { label: '10 × 15 cm', width: 10, height: 15, round: false },
];

export const BANNER_PRESETS = [
  { label: 'A2', width: 42, height: 59.4 },
  { label: 'A1', width: 59.4, height: 84.1 },
  { label: 'A0', width: 84.1, height: 118.9 },
  { label: 'B2', width: 50, height: 70.7 },
  { label: 'B1', width: 70.7, height: 100 },
  { label: 'B0', width: 100, height: 141.4 },
  { label: 'Roll-up 85 × 200', width: 85, height: 200 },
];

export const STICKER_STARTUP = 8.5;
export const BANNER_STARTUP = 10;
export const MAX_PRINT_WIDTH_CM = 137.1;
const STICKER_DISCOUNTS = [0.1, 0.15, 0.2];

/** Afronding van verkoopprijzen: net onder een tiental wordt x9,95 (bijv. 49,40 → 49,95). */
export function roundSalePrice(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const cents = Math.ceil((amount - 1e-9) * 100);
  const wholeEuroCents = Math.ceil(cents / 100) * 100;
  if (wholeEuroCents % 1000 === 0 && wholeEuroCents - 5 >= cents) return (wholeEuroCents - 5) / 100;
  return Math.round((amount + 1e-9) * 100) / 100;
}

export interface CalculatorInput {
  kind: CalculatorKind;
  materialId: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  round?: boolean;
  cassetteId?: string;
}

export interface CalculatorResult {
  valid: boolean;
  warning: string;
  areaM2: number;
  lines: Array<{ label: string; amount: number }>;
  /** Totaal inclusief btw, afgerond. */
  total: number;
  description: string;
  source: string;
}

export function calculatePrice(input: CalculatorInput): CalculatorResult {
  const { kind, widthCm, heightCm, quantity } = input;
  const empty: CalculatorResult = { valid: false, warning: '', areaM2: 0, lines: [], total: 0, description: '', source: '' };
  if (!(widthCm > 0) || !(heightCm > 0) || !Number.isInteger(quantity) || quantity <= 0) {
    return { ...empty, warning: 'Vul een geldige breedte, hoogte en een heel aantal in.' };
  }
  const areaM2 = (widthCm * heightCm * quantity) / 10000;
  const size = input.round && kind === 'sticker'
    ? `Ø ${widthCm.toLocaleString('nl-NL')} cm`
    : `${widthCm.toLocaleString('nl-NL')} × ${heightCm.toLocaleString('nl-NL')} cm`;
  let warning = Math.min(widthCm, heightCm) > MAX_PRINT_WIDTH_CM
    ? `Controleer het formaat: de maximale printbreedte is ${MAX_PRINT_WIDTH_CM.toLocaleString('nl-NL')} cm.`
    : '';

  if (kind === 'sticker') {
    const material = STICKER_MATERIALS.find((entry) => entry.id === input.materialId) ?? STICKER_MATERIALS[0];
    const before = areaM2 * material.ratePerM2;
    const discount = material.ratePerM2 * (
      Math.min(2, Math.max(0, areaM2 - 1)) * STICKER_DISCOUNTS[0] +
      Math.min(2, Math.max(0, areaM2 - 3)) * STICKER_DISCOUNTS[1] +
      Math.max(0, areaM2 - 5) * STICKER_DISCOUNTS[2]
    );
    const raw = before - discount + STICKER_STARTUP;
    const total = roundSalePrice(raw);
    return {
      valid: true,
      warning,
      areaM2,
      total,
      lines: [
        { label: `Stickers ${areaM2.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} m² × € ${material.ratePerM2}/m²`, amount: before },
        ...(discount > 0 ? [{ label: 'Oppervlaktekorting', amount: -discount }] : []),
        { label: 'Opstartkosten', amount: STICKER_STARTUP },
        ...(Math.abs(total - raw) >= 0.005 ? [{ label: 'Prijsafronding', amount: total - raw }] : []),
      ],
      description: `${material.name} ${size}${input.round ? ' (rond)' : ''}`,
      source: `Stickercalculator · ${material.name} · ${size} · ${quantity} st`,
    };
  }

  const material = BANNER_MATERIALS.find((entry) => entry.id === input.materialId) ?? BANNER_MATERIALS[0];
  const cassette = material.rollUp ? CASSETTES.find((entry) => entry.id === input.cassetteId) ?? CASSETTES[0] : CASSETTES[0];
  const print = areaM2 * material.ratePerM2;
  const cassetteTotal = cassette.price * quantity;
  const raw = print + cassetteTotal + BANNER_STARTUP;
  const total = roundSalePrice(raw);
  if (!warning && cassette.widthCm && Math.abs(widthCm - cassette.widthCm) > 2) {
    warning = `Controleer of de breedte bij de roll-up cassette van ${cassette.widthCm} cm past.`;
  }
  return {
    valid: true,
    warning,
    areaM2,
    total,
    lines: [
      { label: `Bannerprint ${areaM2.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} m²`, amount: print },
      ...(cassetteTotal > 0 ? [{ label: `${cassette.name} × ${quantity}`, amount: cassetteTotal }] : []),
      { label: 'Opstartkosten', amount: BANNER_STARTUP },
      ...(Math.abs(total - raw) >= 0.005 ? [{ label: 'Prijsafronding', amount: total - raw }] : []),
    ],
    description: `${material.name} ${size}${cassette.price ? ` + ${cassette.name.toLowerCase()}` : ''}`,
    source: `Bannercalculator · ${material.name} · ${size} · ${quantity} st`,
  };
}

/* ------------------- Selfservice-staffel (printen A4/A3) ------------------- */
/** Dezelfde staffels als de prijslijst van het selfservice-systeem (prijs per pagina, op basis van het totaal aantal pagina's). */
export const SELFSERVICE_BW_TIERS = [
  { upTo: 150, a4: 0.15, a3: 0.30 }, { upTo: 300, a4: 0.13, a3: 0.25 }, { upTo: 500, a4: 0.11, a3: 0.22 },
  { upTo: 750, a4: 0.10, a3: 0.20 }, { upTo: 1000, a4: 0.09, a3: 0.18 }, { upTo: Infinity, a4: 0.07, a3: 0.14 },
];
export const SELFSERVICE_COLOR_TIERS = [
  { upTo: 50, a4: 0.49, a3: 0.98 }, { upTo: 75, a4: 0.45, a3: 0.90 }, { upTo: 99, a4: 0.40, a3: 0.80 },
  { upTo: 249, a4: 0.35, a3: 0.70 }, { upTo: 499, a4: 0.30, a3: 0.60 }, { upTo: 999, a4: 0.27, a3: 0.54 },
  { upTo: Infinity, a4: 0.25, a3: 0.50 },
];
/** Toeslag per vel voor dikker papier. */
export const SELFSERVICE_PAPER = [
  { id: 'standaard', name: 'Standaard papier', a4: 0, a3: 0 },
  { id: '100', name: '100 gr', a4: 0.10, a3: 0.20 },
  { id: '120', name: '120 gr', a4: 0.15, a3: 0.30 },
  { id: '160', name: '160 gr', a4: 0.25, a3: 0.49 },
  { id: '250', name: '250 gr', a4: 0.35, a3: 0.70 },
  { id: '300', name: '300 gr', a4: 0.45, a3: 0.90 },
] as const;

export function calculateSelfservicePrint(input: { size: 'A4' | 'A3'; color: boolean; doubleSided: boolean; sheets: number; paperId: string }) {
  const { size, color, doubleSided, sheets } = input;
  if (!Number.isInteger(sheets) || sheets <= 0) return { valid: false as const, warning: 'Vul een geldig aantal in.' };
  const pages = sheets * (doubleSided ? 2 : 1);
  const tiers = color ? SELFSERVICE_COLOR_TIERS : SELFSERVICE_BW_TIERS;
  const tier = tiers.find((entry) => pages <= entry.upTo) ?? tiers[tiers.length - 1];
  const rate = size === 'A4' ? tier.a4 : tier.a3;
  const paper = SELFSERVICE_PAPER.find((entry) => entry.id === input.paperId) ?? SELFSERVICE_PAPER[0];
  const surcharge = (size === 'A4' ? paper.a4 : paper.a3) * sheets;
  const total = Math.round((pages * rate + surcharge) * 100) / 100;
  return {
    valid: true as const,
    warning: '',
    pages,
    rate,
    surcharge,
    total,
    description: `Printen ${color ? 'kleur' : 'zwart-wit'} ${size}${paper.id === 'standaard' ? '' : ` ${paper.name}`}${doubleSided ? ' dubbelzijdig' : ''}`,
    source: `Selfservice-staffel · ${color ? 'kleur' : 'zwart-wit'} ${size} · ${pages} pagina's à € ${rate.toFixed(2).replace('.', ',')}${surcharge ? ` · papiertoeslag € ${surcharge.toFixed(2).replace('.', ',')}` : ''}`,
  };
}
