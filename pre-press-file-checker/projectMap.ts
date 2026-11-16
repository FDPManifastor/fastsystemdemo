import { REGISTER_SNAPSHOT, REGISTER_SNAPSHOT_DATE } from "./registerSnapshot";

/**
 * Gegevens voor de 3D-map (/map): het FDP Register uit Notion.
 *
 * - NOTION_TOKEN: dezelfde Notion-integratie als voor de productcatalogus; de pagina "FDP Register"
 *   moet via Verbindingen met die integratie gedeeld zijn.
 * - NOTION_REGISTER_DATABASE_ID: optioneel; standaard de database "Register" onder "FDP Register".
 *
 * Zonder token of bij een fout valt de map terug op de ingebouwde snapshot.
 */

export type MapNode = {
  id: string;
  name: string;
  type: string;
  area: string;
  status: string;
  path: string;
  url: string;
  description: string;
  parentId: string | null;
  dependsOn: string[];
  order: number;
};

export type MapData = {
  source: "notion" | "snapshot";
  syncedAt: string;
  error?: string;
  nodes: MapNode[];
};

const DEFAULT_DATABASE_ID = "41aaf2f5e66c81b98daaed24c2e5b8dd";
const NOTION_VERSION = "2022-06-28";
const CACHE_MS = 60 * 1000;

function plain(property: any): string {
  if (!property) return "";
  const parts = property.title || property.rich_text;
  return Array.isArray(parts) ? parts.map((part: any) => part?.plain_text || "").join("").trim() : "";
}

function relationIds(property: any): string[] {
  return Array.isArray(property?.relation) ? property.relation.map((item: any) => String(item?.id || "")).filter(Boolean) : [];
}

function toNode(page: any): MapNode | null {
  const p = page?.properties || {};
  const name = plain(p["Naam"]);
  if (!name || page?.archived || page?.in_trash) return null;
  return {
    id: String(page.id),
    name,
    type: p["Type"]?.select?.name || "",
    area: p["Gebied"]?.select?.name || "Algemeen",
    status: p["Status"]?.select?.name || "Idee",
    path: plain(p["Pad in repo"]),
    url: p["Live URL"]?.url || "",
    description: plain(p["Beschrijving"]),
    parentId: relationIds(p["Hoort bij"])[0] || null,
    dependsOn: relationIds(p["Hangt af van"]),
    order: Number(p["Volgorde"]?.number ?? 0) || 0,
  };
}

async function fetchRegister(token: string, databaseId: string): Promise<MapNode[]> {
  const nodes: MapNode[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
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
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`Notion gaf status ${response.status}: ${detail}`);
    }
    const body: any = await response.json();
    for (const row of body.results || []) {
      const node = toNode(row);
      if (node) nodes.push(node);
    }
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return nodes;
}

function snapshot(error?: string): MapData {
  return {
    source: "snapshot",
    syncedAt: REGISTER_SNAPSHOT_DATE,
    ...(error ? { error } : {}),
    nodes: REGISTER_SNAPSHOT,
  };
}

export function createProjectMap() {
  let cache: { at: number; data: MapData } | null = null;
  let pending: Promise<MapData> | null = null;

  const token = () => process.env.NOTION_TOKEN?.trim() || "";
  const databaseId = () => (process.env.NOTION_REGISTER_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID).replace(/-/g, "");

  async function load(): Promise<MapData> {
    if (!token()) return snapshot("NOTION_TOKEN is niet ingesteld; dit is de ingebouwde snapshot.");
    try {
      const nodes = await fetchRegister(token(), databaseId());
      if (nodes.length === 0) {
        return snapshot("Notion gaf geen onderdelen terug. Is het FDP Register gedeeld met de integratie (Verbindingen)?");
      }
      return { source: "notion", syncedAt: new Date().toISOString(), nodes };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[map] Register ophalen uit Notion mislukt:", message);
      return snapshot(message);
    }
  }

  async function get(force = false): Promise<MapData> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
    if (!pending) {
      pending = load()
        .then((data) => {
          cache = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  }

  return { get };
}
