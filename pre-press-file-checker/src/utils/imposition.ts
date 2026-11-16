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
  bleedMm: number;
  cropMarks: boolean;
}

export const SHEET_PRESETS = [
  { id: 'sra3', name: 'SRA3 (320 × 450 mm)', width: 320, height: 450 },
  { id: 'a3', name: 'A3 (297 × 420 mm)', width: 297, height: 420 },
  { id: 'a4', name: 'A4 (210 × 297 mm)', width: 210, height: 297 },
] as const;

const MARK_GAP_MM = 1;
const MARK_LENGTH_MM = 4;
const MM = 72 / 25.4;

export interface ImpositionPlan {
  cellWidthMm: number;
  cellHeightMm: number;
  blockWidthMm: number;
  blockHeightMm: number;
  offsetXMm: number;
  offsetYMm: number;
  marginNeededMm: number;
  fits: boolean;
  maxColumns: number;
  maxRows: number;
  valid: boolean;
}

export function planImposition(settings: ImpositionSettings): ImpositionPlan {
  const { sheetWidthMm, sheetHeightMm, columns, rows, trimWidthMm, trimHeightMm, bleedMm, cropMarks } = settings;
  const valid = [sheetWidthMm, sheetHeightMm, trimWidthMm, trimHeightMm].every((value) => Number.isFinite(value) && value > 0)
    && Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0
    && Number.isFinite(bleedMm) && bleedMm >= 0;
  const cellWidthMm = trimWidthMm + 2 * bleedMm;
  const cellHeightMm = trimHeightMm + 2 * bleedMm;
  const blockWidthMm = cellWidthMm * columns;
  const blockHeightMm = cellHeightMm * rows;
  const marginNeededMm = cropMarks ? MARK_GAP_MM + MARK_LENGTH_MM : 0;
  const usableW = sheetWidthMm - 2 * marginNeededMm;
  const usableH = sheetHeightMm - 2 * marginNeededMm;
  return {
    cellWidthMm,
    cellHeightMm,
    blockWidthMm,
    blockHeightMm,
    offsetXMm: (sheetWidthMm - blockWidthMm) / 2,
    offsetYMm: (sheetHeightMm - blockHeightMm) / 2,
    marginNeededMm,
    fits: valid && blockWidthMm <= usableW + 1e-6 && blockHeightMm <= usableH + 1e-6,
    maxColumns: valid ? Math.max(0, Math.floor((usableW + 1e-6) / cellWidthMm)) : 0,
    maxRows: valid ? Math.max(0, Math.floor((usableH + 1e-6) / cellHeightMm)) : 0,
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

  const cellW = plan.cellWidthMm * MM;
  const cellH = plan.cellHeightMm * MM;
  const bleed = settings.bleedMm * MM;
  const originX = plan.offsetXMm * MM;
  const originY = plan.offsetYMm * MM;
  const black = rgb(0, 0, 0);

  for (const artwork of artworks) {
    const page = output.addPage([settings.sheetWidthMm * MM, settings.sheetHeightMm * MM]);
    const scale = Math.max(cellW / artwork.width, cellH / artwork.height);
    const drawW = artwork.width * scale;
    const drawH = artwork.height * scale;

    for (let row = 0; row < settings.rows; row += 1) {
      for (let column = 0; column < settings.columns; column += 1) {
        const x = originX + column * cellW;
        const y = originY + row * cellH;
        page.pushOperators(pushGraphicsState(), rectangle(x, y, cellW, cellH), clip(), endPath());
        artwork.draw(page, x + (cellW - drawW) / 2, y + (cellH - drawH) / 2, drawW, drawH);
        page.pushOperators(popGraphicsState());
      }
    }

    if (settings.cropMarks) {
      const gap = MARK_GAP_MM * MM;
      const length = MARK_LENGTH_MM * MM;
      const blockW = cellW * settings.columns;
      const blockH = cellH * settings.rows;
      const line = (x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.25, color: black });
      for (let column = 0; column < settings.columns; column += 1) {
        for (const trimX of [originX + column * cellW + bleed, originX + (column + 1) * cellW - bleed]) {
          line(trimX, originY - gap, trimX, originY - gap - length);
          line(trimX, originY + blockH + gap, trimX, originY + blockH + gap + length);
        }
      }
      for (let row = 0; row < settings.rows; row += 1) {
        for (const trimY of [originY + row * cellH + bleed, originY + (row + 1) * cellH - bleed]) {
          line(originX - gap, trimY, originX - gap - length, trimY);
          line(originX + blockW + gap, trimY, originX + blockW + gap + length, trimY);
        }
      }
    }
  }

  output.setTitle('Ingeslagen drukvel');
  output.setProducer('FD Printing Center');
  return output.save();
}
