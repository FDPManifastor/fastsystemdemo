import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';

/** Inslaan (imposition): meerdere exemplaren op één drukvel met afloop en snijlijnen. Alle maten in mm. */
export interface ImpositionSettings {
  sheetWidthMm: number;
  sheetHeightMm: number;
  columns: number;
  rows: number;
  /** Eindformaat (schoongesneden) van één exemplaar. */
  trimWidthMm: number;
  trimHeightMm: number;
  /** Afloop rondom het ontwerp; wordt in de ruimte tussen de ontwerpen getekend. */
  bleedMm: number;
  cropMarks: boolean;
  /** Ruimte tussen de ontwerpen (van snijrand tot snijrand). Standaard 4 mm. */
  gapMm?: number;
}

export const DEFAULT_GAP_MM = 4;

export const SHEET_PRESETS = [
  { id: 'sra3', name: 'SRA3 (320 × 450 mm)', width: 320, height: 450 },
  { id: 'a3', name: 'A3 (297 × 420 mm)', width: 297, height: 420 },
  { id: 'a4', name: 'A4 (210 × 297 mm)', width: 210, height: 297 },
] as const;

/** Vaste papierformaten (staand, mm). */
export const PAPER_SIZES = [
  { id: 'A8', name: 'A8 (52 × 74 mm)', width: 52, height: 74 },
  { id: 'A7', name: 'A7 (74 × 105 mm)', width: 74, height: 105 },
  { id: 'A6', name: 'A6 (105 × 148 mm)', width: 105, height: 148 },
  { id: 'A5', name: 'A5 (148 × 210 mm)', width: 148, height: 210 },
  { id: 'A4', name: 'A4 (210 × 297 mm)', width: 210, height: 297 },
  { id: 'A3', name: 'A3 (297 × 420 mm)', width: 297, height: 420 },
] as const;

/** Haalt A8 t/m A3 uit een productnaam zoals "250 a6 Flyers offset 135gr". */
export function detectPaperSize(...texts: Array<unknown>) {
  for (const text of texts) {
    const match = /(?:^|[^a-z0-9])a\s?([3-8])(?![0-9])/i.exec(String(text ?? ''));
    if (match) return PAPER_SIZES.find((size) => size.id === `A${match[1]}`);
  }
  return undefined;
}

const MARK_GAP_MM = 1;
const MARK_LENGTH_MM = 4;
const MM = 72 / 25.4;

export interface ImpositionPlan {
  /** Ruimte tussen de ontwerpen (snijrand tot snijrand). */
  gapMm: number;
  /** Afloop die echt gebruikt wordt (nooit meer dan de helft van de ruimte tussen ontwerpen). */
  bleedMm: number;
  /** Afstand van het begin van het ene ontwerp tot het begin van het volgende. */
  pitchWidthMm: number;
  pitchHeightMm: number;
  /** Alle ontwerpen samen, gemeten van snijrand tot snijrand. */
  trimBlockWidthMm: number;
  trimBlockHeightMm: number;
  /** Linksonder van het eerste ontwerp (snijrand). */
  originXMm: number;
  originYMm: number;
  /** Totaal inclusief afloop. */
  blockWidthMm: number;
  blockHeightMm: number;
  marginNeededMm: number;
  fits: boolean;
  maxColumns: number;
  maxRows: number;
  valid: boolean;
}

export function planImposition(settings: ImpositionSettings): ImpositionPlan {
  const { sheetWidthMm, sheetHeightMm, columns, rows, trimWidthMm, trimHeightMm, cropMarks } = settings;
  const gapMm = settings.gapMm ?? DEFAULT_GAP_MM;
  const valid = [sheetWidthMm, sheetHeightMm, trimWidthMm, trimHeightMm].every((value) => Number.isFinite(value) && value > 0)
    && Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0
    && Number.isFinite(settings.bleedMm) && settings.bleedMm >= 0 && Number.isFinite(gapMm) && gapMm >= 0;
  const multiple = columns * rows > 1;
  const bleedMm = multiple ? Math.min(settings.bleedMm, gapMm / 2) : settings.bleedMm;
  const pitchWidthMm = trimWidthMm + gapMm;
  const pitchHeightMm = trimHeightMm + gapMm;
  const trimBlockWidthMm = columns * trimWidthMm + (columns - 1) * gapMm;
  const trimBlockHeightMm = rows * trimHeightMm + (rows - 1) * gapMm;
  const blockWidthMm = trimBlockWidthMm + 2 * bleedMm;
  const blockHeightMm = trimBlockHeightMm + 2 * bleedMm;
  const marginNeededMm = cropMarks ? MARK_GAP_MM + MARK_LENGTH_MM : 0;
  const usableW = sheetWidthMm - 2 * marginNeededMm;
  const usableH = sheetHeightMm - 2 * marginNeededMm;
  const fitCount = (usable: number, trim: number) => Math.max(0, Math.floor((usable - 2 * Math.min(settings.bleedMm, gapMm / 2) + gapMm + 1e-6) / (trim + gapMm)));
  return {
    gapMm,
    bleedMm,
    pitchWidthMm,
    pitchHeightMm,
    trimBlockWidthMm,
    trimBlockHeightMm,
    originXMm: (sheetWidthMm - trimBlockWidthMm) / 2,
    originYMm: (sheetHeightMm - trimBlockHeightMm) / 2,
    blockWidthMm,
    blockHeightMm,
    marginNeededMm,
    fits: valid && blockWidthMm <= usableW + 1e-6 && blockHeightMm <= usableH + 1e-6,
    maxColumns: valid ? fitCount(usableW, trimWidthMm) : 0,
    maxRows: valid ? fitCount(usableH, trimHeightMm) : 0,
    valid,
  };
}

/**
 * Bouwt de ingeslagen pdf. Het bronbestand (pdf, png of jpg) wordt per exemplaar gecentreerd
 * en vullend in het vak (eindformaat + afloop) geplaatst en op de afloop afgesneden.
 * Voor een pdf met meerdere pagina's komt er één vel per pagina (bijv. voor- en achterzijde).
 */
export async function buildImposedPdf(source: Uint8Array, fileType: string, settings: ImpositionSettings): Promise<Uint8Array> {
  const plan = planImposition(settings);
  if (!plan.valid) throw new Error('De instellingen voor het inslaan zijn ongeldig.');
  if (!plan.fits) throw new Error('De exemplaren passen niet op het gekozen vel.');

  const output = await PDFDocument.create();
  type Artwork = { width: number; height: number; draw: (page: PDFPage, x: number, y: number, width: number, height: number) => void };
  const artworks: Artwork[] = [];

  if (fileType === 'application/pdf') {
    const sourceDocument = await PDFDocument.load(source, { ignoreEncryption: true });
    const indices = sourceDocument.getPageIndices().slice(0, 50);
    const embedded = await output.embedPdf(sourceDocument, indices);
    embedded.forEach((embeddedPage) => {
      artworks.push({
        width: embeddedPage.width,
        height: embeddedPage.height,
        draw: (page, x, y, width, height) => page.drawPage(embeddedPage, { x, y, width, height }),
      });
    });
  } else {
    const image = fileType === 'image/png' ? await output.embedPng(source) : await output.embedJpg(source);
    artworks.push({
      width: image.width,
      height: image.height,
      draw: (page, x, y, width, height) => page.drawImage(image, { x, y, width, height }),
    });
  }
  if (artworks.length === 0) throw new Error('Het bestand bevat geen pagina\'s.');

  const trimW = settings.trimWidthMm * MM;
  const trimH = settings.trimHeightMm * MM;
  const bleed = plan.bleedMm * MM;
  const pitchW = plan.pitchWidthMm * MM;
  const pitchH = plan.pitchHeightMm * MM;
  const originX = plan.originXMm * MM;
  const originY = plan.originYMm * MM;
  const cellW = trimW + 2 * bleed;
  const cellH = trimH + 2 * bleed;
  const black = rgb(0, 0, 0);

  for (const artwork of artworks) {
    const page = output.addPage([settings.sheetWidthMm * MM, settings.sheetHeightMm * MM]);
    const scale = Math.max(cellW / artwork.width, cellH / artwork.height);
    const drawW = artwork.width * scale;
    const drawH = artwork.height * scale;

    for (let row = 0; row < settings.rows; row += 1) {
      for (let column = 0; column < settings.columns; column += 1) {
        const x = originX + column * pitchW - bleed;
        const y = originY + row * pitchH - bleed;
        page.pushOperators(pushGraphicsState(), rectangle(x, y, cellW, cellH), clip(), endPath());
        artwork.draw(page, x + (cellW - drawW) / 2, y + (cellH - drawH) / 2, drawW, drawH);
        page.pushOperators(popGraphicsState());
      }
    }

    if (settings.cropMarks) {
      const gap = MARK_GAP_MM * MM;
      const length = MARK_LENGTH_MM * MM;
      const blockBottom = originY - bleed;
      const blockTop = originY + plan.trimBlockHeightMm * MM + bleed;
      const blockLeft = originX - bleed;
      const blockRight = originX + plan.trimBlockWidthMm * MM + bleed;
      const line = (x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.25, color: black });
      for (let column = 0; column < settings.columns; column += 1) {
        for (const trimX of [originX + column * pitchW, originX + column * pitchW + trimW]) {
          line(trimX, blockBottom - gap, trimX, blockBottom - gap - length);
          line(trimX, blockTop + gap, trimX, blockTop + gap + length);
        }
      }
      for (let row = 0; row < settings.rows; row += 1) {
        for (const trimY of [originY + row * pitchH, originY + row * pitchH + trimH]) {
          line(blockLeft - gap, trimY, blockLeft - gap - length, trimY);
          line(blockRight + gap, trimY, blockRight + gap + length, trimY);
        }
      }
    }
  }

  output.setTitle('Ingeslagen drukvel');
  output.setProducer('FD Printing Center');
  return output.save();
}

export interface AutoImposition extends ImpositionSettings {
  /** 'sra3': zo veel mogelijk exemplaren op SRA3; 'product': te groot voor SRA3, vel op posterformaat plus afloop en snijranden. */
  sheetKind: 'sra3' | 'product';
}

/**
 * Standaard indeling: kleine producten zo vol mogelijk op SRA3 (staand of liggend, wat het meeste past),
 * grote producten zoals posters (bijv. A1) één per vel op het formaat van het product plus afloop en ruimte voor snijranden.
 */
export function autoImposeSettings(trimWidthMm: number, trimHeightMm: number, bleedMm = 0, cropMarks = true, gapMm = DEFAULT_GAP_MM): AutoImposition {
  const base = { trimWidthMm, trimHeightMm, bleedMm, cropMarks, gapMm };
  const sra3 = SHEET_PRESETS[0];
  const portrait = { ...base, sheetWidthMm: sra3.width, sheetHeightMm: sra3.height, columns: 1, rows: 1 };
  const landscape = { ...base, sheetWidthMm: sra3.height, sheetHeightMm: sra3.width, columns: 1, rows: 1 };
  const portraitPlan = planImposition(portrait);
  const landscapePlan = planImposition(landscape);
  const portraitCount = portraitPlan.maxColumns * portraitPlan.maxRows;
  const landscapeCount = landscapePlan.maxColumns * landscapePlan.maxRows;
  if (portraitCount > 0 || landscapeCount > 0) {
    const useLandscape = landscapeCount > portraitCount;
    const plan = useLandscape ? landscapePlan : portraitPlan;
    return { ...(useLandscape ? landscape : portrait), columns: plan.maxColumns, rows: plan.maxRows, sheetKind: 'sra3' };
  }
  const margin = cropMarks ? MARK_GAP_MM + MARK_LENGTH_MM : 0;
  return {
    ...base,
    sheetWidthMm: Math.ceil(trimWidthMm + 2 * bleedMm + 2 * margin),
    sheetHeightMm: Math.ceil(trimHeightMm + 2 * bleedMm + 2 * margin),
    columns: 1,
    rows: 1,
    sheetKind: 'product',
  };
}
