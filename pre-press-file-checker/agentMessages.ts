/**
 * Agent-berichten voor de 3D-map (/map?view=3d).
 *
 * Bron: de database "Agent-berichten" onder "FDP Register" in Notion. De FDP-agents schrijven daar
 * ideeën, waarschuwingen en reacties in, gekoppeld aan een onderdeel uit het Register.
 * Vanuit de map kan de beheerder een idee goedkeuren (Uitvoeren), afwijzen of erop reageren.
 *
 * - NOTION_TOKEN: dezelfde integratie als voor het Register. De pagina "FDP Register" moet met de
 *   integratie gedeeld zijn; de integratie heeft "Inhoud bijwerken" en "Inhoud invoegen" nodig.
 * - NOTION_AGENT_DATABASE_ID: optioneel; standaard de database "Agent-berichten".
 */

export type AgentMessage = {
  id: string;
  nr: string;
  title: string;
  nodeId: string | null;
  agent: string;
  kind: string;
  text: string;
  priority: string;
  effort: string;
  status: string;
  github: string;
  replyTo: string | null;
  createdAt: string;
};

export type AgentMessagesData = {
  ok: boolean;
  error?: string;
  syncedAt: string;
  messages: AgentMessage[];
};

const DEFAULT_DATABASE_ID = "41caf2f5e66c81f28c98ce881fb13ea4";
const NOTION_VERSION = "2022-06-28";
const CACHE_MS = 30 * 1000;

/** Alleen deze statuswijzigingen mogen vanuit de map. */
export const AGENT_ACTIONS: Record<string, string> = {
  approve: "Goedgekeurd",
  reject: "Afgewezen",
  done: "Uitgevoerd",
};

function plain(property: any): string {
  if (!property) return "";
  const parts = property.title || property.rich_text;
  return Array.isArray(parts) ? parts.map((part: any) => part?.plain_text || "").join("").trim() : "";
}

function firstRelation(property: any): string | null {
  const list = Array.isArray(property?.relation) ? property.relation : [];
  return list.length ? String(list[0]?.id || "") || null : null;
}

function toMessage(page: any): AgentMessage | null {
  if (!page || page.archived || page.in_trash) return null;
  const p = page.properties || {};
  const uid = p["Nr"]?.unique_id;
  return {
    id: String(page.id),
    nr: uid ? `${uid.prefix ? `${uid.prefix}-` : ""}${uid.number}` : "",
    title: plain(p["Titel"]) || "(zonder titel)",
    nodeId: firstRelation(p["Onderdeel"]),
    agent: p["Agent"]?.select?.name || "",
    kind: p["Soort"]?.select?.name || "Idee",
    text: plain(p["Tekst"]),
    priority: p["Prioriteit"]?.select?.name || "",
    effort: p["Inspanning"]?.select?.name || "",
    status: p["Status"]?.select?.name || "Nieuw",
    github: p["GitHub"]?.url || "",
    replyTo: firstRelation(p["Reactie op"]),
    createdAt: String(page.created_time || ""),
  };
}

const richText = (value: string) => [{ type: "text", text: { content: value.slice(0, 1900) } }];

export function createAgentMessages() {
  let cache: { at: number; data: AgentMessagesData } | null = null;
  let pending: Promise<AgentMessagesData> | null = null;

  const token = () => process.env.NOTION_TOKEN?.trim() || "";
  const databaseId = () => (process.env.NOTION_AGENT_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID).replace(/-/g, "");

  async function notion(path: string, init: { method: string; body?: unknown }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`https://api.notion.com/v1/${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token()}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        throw new Error(`Notion gaf status ${response.status}: ${detail}`);
      }
      return response.json();
    }
    throw new Error("Notion is even te druk. Probeer het zo opnieuw.");
  }

  async function load(): Promise<AgentMessagesData> {
    const syncedAt = new Date().toISOString();
    if (!token()) return { ok: false, error: "NOTION_TOKEN is niet ingesteld; agentberichten zijn niet beschikbaar.", syncedAt, messages: [] };
    try {
      const messages: AgentMessage[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page += 1) {
        const body: any = await notion(`databases/${databaseId()}/query`, {
          method: "POST",
          body: {
            page_size: 100,
            sorts: [{ timestamp: "created_time", direction: "descending" }],
            ...(cursor ? { start_cursor: cursor } : {}),
          },
        });
        for (const row of body.results || []) {
          const message = toMessage(row);
          if (message) messages.push(message);
        }
        if (!body.has_more || !body.next_cursor) break;
        cursor = body.next_cursor;
      }
      return { ok: true, syncedAt, messages };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[map] Agent-berichten ophalen uit Notion mislukt:", message);
      return { ok: false, error: `Agentberichten niet geladen: ${message}`, syncedAt, messages: [] };
    }
  }

  async function list(force = false): Promise<AgentMessagesData> {
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

  async function getMessage(id: string): Promise<AgentMessage | null> {
    return toMessage(await notion(`pages/${id}`, { method: "GET" }));
  }

  /** Zet de status van een bericht (alleen de toegestane acties). */
  async function setStatus(id: string, action: string): Promise<AgentMessage> {
    const status = AGENT_ACTIONS[action];
    if (!status) throw new Error("Onbekende actie.");
    const current = await getMessage(id);
    if (!current) throw new Error("Bericht niet gevonden.");
    if (action === "approve" && !["Nieuw", "Afgewezen"].includes(current.status)) {
      throw new Error(`Dit bericht staat al op "${current.status}".`);
    }
    const updated = toMessage(
      await notion(`pages/${id}`, { method: "PATCH", body: { properties: { Status: { select: { name: status } } } } }),
    );
    cache = null;
    if (!updated) throw new Error("Bericht niet gevonden.");
    return updated;
  }

  /** Reactie van de beheerder op een bericht of een nieuw eigen idee bij een onderdeel. */
  async function create(input: { nodeId: string | null; replyTo: string | null; title: string; text: string; kind: "Reactie" | "Idee" }) {
    const properties: Record<string, unknown> = {
      Titel: { title: richText(input.title.slice(0, 140)) },
      Agent: { select: { name: "Beheerder" } },
      Soort: { select: { name: input.kind } },
      Tekst: { rich_text: richText(input.text) },
      Status: { select: { name: "Nieuw" } },
    };
    if (input.nodeId) properties["Onderdeel"] = { relation: [{ id: input.nodeId }] };
    if (input.replyTo) properties["Reactie op"] = { relation: [{ id: input.replyTo }] };
    const created = toMessage(await notion("pages", { method: "POST", body: { parent: { database_id: databaseId() }, properties } }));
    cache = null;
    if (!created) throw new Error("Opslaan in Notion is mislukt.");
    return created;
  }

  return { list, setStatus, create };
}
