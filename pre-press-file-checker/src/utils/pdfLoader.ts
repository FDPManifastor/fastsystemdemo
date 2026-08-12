/**
 * Dynamic CDN Loader and Renderer for PDF.js to support seamless client-side 
 * PDF rendering in sandboxed iframe previews.
 */

interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
}

interface PdfRenderResult {
  pages: RenderedPage[];
  widthMm: number;
  heightMm: number;
  pageCount: number;
}

const PDF_JS_VERSION = '3.11.174';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.js`;

let loadingPromise: Promise<any> | null = null;

export function loadPdfJs(): Promise<any> {
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    // Already loaded in window?
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }

    const script = document.createElement('script');
    script.src = PDFJS_CDN;
    script.async = true;
    
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        resolve(pdfjsLib);
      } else {
        reject(new Error('PDF.js failed to initialize on search window namespace.'));
      }
    };

    script.onerror = () => {
      loadingPromise = null; // allow retrying
      reject(new Error('Er was een probleem met het laden van de PDF preview engine vanaf het CDN.'));
    };

    document.head.appendChild(script);
  });

  return loadingPromise;
}

/**
 * Parses and renders pages of a PDF to base64 images
 */
export async function renderPdfFile(file: File, maxPagesToRender: number = 8): Promise<PdfRenderResult> {
  const pdfjsLib = await loadPdfJs();
  const fileReader = new FileReader();

  return new Promise((resolve, reject) => {
    fileReader.onload = async function() {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        const pageCount = pdf.numPages;

        if (pageCount === 0) {
          throw new Error('PDF bestand bevat geen pagina\'s.');
        }

        const pages: RenderedPage[] = [];
        
        // Take first page to determine physical mm dimensions of PDF artboards
        // PDF points: 72 points per inch. 1 inch = 25.4 mm.
        const referencePage = await pdf.getPage(1);
        const referenceViewport = referencePage.getViewport({ scale: 1.0 });
        
        const widthMm = Math.round((referenceViewport.width / 72) * 25.4);
        const heightMm = Math.round((referenceViewport.height / 72) * 25.4);

        // Render request up to maxPagesToRender
        const renderCycles = Math.min(pageCount, maxPagesToRender);
        for (let i = 1; i <= renderCycles; i++) {
          const page = await pdf.getPage(i);
          
          // Render at high definition scale 2.2x to keep text and fine lines sharp inside the editor
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          if (!context) {
            throw new Error('Canvas 2D context retrieval failed.');
          }

          // Anti-aliasing quality flags
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          await page.render(renderContext).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          
          pages.push({
            dataUrl,
            width: viewport.width,
            height: viewport.height,
          });
        }

        resolve({
          pages,
          widthMm,
          heightMm,
          pageCount,
        });
      } catch (err) {
        reject(err);
      }
    };

    fileReader.onerror = () => {
      reject(new Error('Fout bij het inlezen van PDF bestand.'));
    };

    fileReader.readAsArrayBuffer(file);
  });
}
