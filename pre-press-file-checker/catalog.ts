import type { Storage } from "./storage";

/**
 * Productcatalogus uit Notion (FDPBRAIN → Producten Database → "Producten — Lightspeed X-Series").
 *
 * - NOTION_TOKEN: token van een Notion-integratie die toegang heeft tot de productendatabase.
 * - NOTION_PRODUCTS_DATABASE_ID: optioneel; standaard de FDPBRAIN-productendatabase.
 *
 * De catalogus wordt in de database bewaard, zodat zoeken ook werkt als Notion even niet bereikbaar is,
 * en wordt automatisch ververst (standaard elk uur).
 */

export type CatalogProduct = {
  /** Productnaam inclusief variant, zoals in Notion. */
  name: string;
  sku: string;
  category: string;
  variants: string[];
  /** Verkoopprijs inclusief btw. 0 = geen prijs bekend. */
  price: number;
  vat: number;
  keywords: string;
};

export type Catalog = { syncedAt: string | null; source: "notion" | "none"; products: CatalogProduct[] };

const DEFAULT_DATABASE_ID = "7283e8a805484762b696f318da08e784";
const META_KEY = "product_catalog_v1";
const REFRESH_MS = 60 * 60 * 1000;
const NOTION_VERSION = "2022-06-28";

function plain(property: any): string {
  if (!property) return "";
  const parts = property.title || property.rich_text;
  return Array.isArray(parts) ? parts.map((part: any) => part?.plain_text || "").join("").trim() : "";
}

function toProduct(page: any): CatalogProduct | null {
  const p = page?.properties || {};
  const name = plain(p["Product"]);
  if (!name) return null;
  const price = Number(p["Verkoopprijs incl. btw"]?.number ?? 0);
  return {
    name,
    sku: plain(p["SKU"]),
    category: plain(p["Categorie"]),
    variants: [plain(p["Variant 1"]), plain(p["Variant 2"]), plain(p["Variant 3"])].filter(Boolean),
    price: Number.isFinite(price) && price > 0 ? price : 0,
    vat: Number(p["Btw-percentage"]?.number ?? 21) || 21,
    keywords: [plain(p["Zoekwoorden"]), plain(p["Omschrijving"])].filter(Boolean).join(" ").slice(0, 300),
  };
}

async function fetchFromNotion(token: string, databaseId: string): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      page -= 1;
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Notion gaf status ${response.status}: ${detail}`);
    }
    const body: any = await response.json();
    for (const row of body.results || []) {
      const product = toProduct(row);
      if (product) products.push(product);
    }
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return products;
}

export function createCatalog(storage: Storage) {
  let cache: Catalog = { syncedAt: null, source: "none", products: [] };
  let loaded = false;
  let syncing: Promise<Catalog> | null = null;
  let lastError = "";

  const token = () => process.env.NOTION_TOKEN?.trim() || "";
  const databaseId = () => (process.env.NOTION_PRODUCTS_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID).replace(/-/g, "");

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await storage.getMeta(META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.products)) cache = parsed;
      }
    } catch (error) {
      console.error("[catalog] Opgeslagen catalogus kon niet worden gelezen:", error);
    }
  }

  function sync(): Promise<Catalog> {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        if (!token()) throw new Error("NOTION_TOKEN is niet ingesteld.");
        const products = await fetchFromNotion(token(), databaseId());
        if (products.length === 0) {
          throw new Error("Notion gaf geen producten terug. Heeft de integratie toegang tot de productendatabase?");
        }
        cache = { syncedAt: new Date().toISOString(), source: "notion", products };
        await storage.setMeta(META_KEY, JSON.stringify(cache));
        lastError = "";
        console.log(`[catalog] ${products.length} producten uit Notion opgehaald.`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error("[catalog] Synchronisatie met Notion mislukt:", lastError);
        throw error;
      } finally {
        syncing = null;
      }
      return cache;
    })();
    return syncing;
  }

  async function get(): Promise<Catalog> {
    await load();
    const age = cache.syncedAt ? Date.now() - new Date(cache.syncedAt).getTime() : Infinity;
    if (token() && age > REFRESH_MS) {
      if (cache.products.length === 0) {
        try {
          await sync();
        } catch {
          /* fout staat in lastError */
        }
      } else {
        void sync().catch(() => undefined);
      }
    }
    return cache;
  }

  return {
    get,
    sync: async () => {
      await load();
      return sync();
    },
    status: () => ({
      configured: Boolean(token()),
      count: cache.products.length,
      syncedAt: cache.syncedAt,
      error: lastError,
    }),
  };
}
