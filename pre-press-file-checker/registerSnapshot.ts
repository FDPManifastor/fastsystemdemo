// Reserve-gegevens voor de 3D-map als Notion niet bereikbaar is. Bron: FDP Register in Notion.
// Wordt automatisch vervangen door live gegevens zodra NOTION_TOKEN is ingesteld.
import type { MapNode } from "./projectMap";

export const REGISTER_SNAPSHOT_DATE = "2026-11-16";

export const REGISTER_SNAPSHOT: MapNode[] = [
  {
    "id": "webapp",
    "name": "FDP WebApp",
    "type": "Pagina",
    "area": "Algemeen",
    "status": "Live",
    "path": "pre-press-file-checker/",
    "url": "https://fastsystemdemo.onrender.com",
    "description": "Hoofdapp van FD Printing Center: opdrachtbon, backoffice, klantstatuspagina, pre-press check en imposition. React + Vite client, Express server (server.ts).",
    "parentId": null,
    "dependsOn": [
      "render",
      "github"
    ],
    "order": 0
  },
  {
    "id": "render",
    "name": "Render (fastsystemdemo)",
    "type": "Dienst",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "https://fastsystemdemo.onrender.com",
    "description": "Hosting. Root Directory pre-press-file-checker/, build 'npm install && npm run build', start 'bun run start'. Auto-deploy vanaf main. Gratis plan: slaapt na inactiviteit.",
    "parentId": "webapp",
    "dependsOn": [
      "github"
    ],
    "order": 1
  },
  {
    "id": "neon",
    "name": "Neon Postgres (FDPC)",
    "type": "Dienst",
    "area": "Opslag",
    "status": "Live",
    "path": "",
    "url": "",
    "description": "Database in Frankfurt. Verbinding via DATABASE_URL op Render. Tabellen worden automatisch aangemaakt.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 2
  },
  {
    "id": "notion",
    "name": "Notion (FDPBRAIN)",
    "type": "Dienst",
    "area": "Catalogus",
    "status": "Bezig",
    "path": "",
    "url": "",
    "description": "Bron voor producten en prijzen (Producten Database, ca. 1072 items). Koppeling via NOTION_TOKEN.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 3
  },
  {
    "id": "github",
    "name": "GitHub FDPManifastor/fastsystemdemo",
    "type": "Dienst",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "https://github.com/FDPManifastor/fastsystemdemo",
    "description": "Code-repository. Branch main wordt automatisch door Render uitgerold. Ook bereikbaar via GitHub Codespace.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 4
  },
  {
    "id": "bon",
    "name": "Opdrachtbon",
    "type": "Scherm",
    "area": "Opdrachtbon",
    "status": "Live",
    "path": "src/components/OrderTicketWorkspace.tsx",
    "url": "",
    "description": "Invoerscherm voor medewerkers in de lay-out van de papieren bon. Producten uit Notion, calculatoren, bestand per product, pre-press check, opslaan, printen en mailen, status-QR.",
    "parentId": "webapp",
    "dependsOn": [
      "catalogus",
      "calc",
      "prepress",
      "server"
    ],
    "order": 10
  },
  {
    "id": "backoffice",
    "name": "Backoffice",
    "type": "Scherm",
    "area": "Backoffice",
    "status": "Live",
    "path": "src/App.tsx",
    "url": "",
    "description": "Overzicht van alle orders met statussen, bestanden (miniatuur, downloaden, inslaan), medewerkersbeheer en inloggen.",
    "parentId": "webapp",
    "dependsOn": [
      "imposition",
      "server"
    ],
    "order": 20
  },
  {
    "id": "klant",
    "name": "Klantstatuspagina",
    "type": "Pagina",
    "area": "Klantpagina",
    "status": "Live",
    "path": "src/App.tsx",
    "url": "",
    "description": "Pagina achter de status-QR: status van de opdracht, wat nog open staat en per product een uploadknop.",
    "parentId": "webapp",
    "dependsOn": [
      "server"
    ],
    "order": 30
  },
  {
    "id": "prepress",
    "name": "Pre-press check",
    "type": "Component",
    "area": "Pre-press",
    "status": "Live",
    "path": "src/components/LiveFilePreview.tsx",
    "url": "",
    "description": "Preflight van een bestand: formaat, verhouding, resolutie. Op de bon via TicketPrepressModal; slaat een notitie op bij het product.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 40
  },
  {
    "id": "imposition",
    "name": "Imposition (inslaan)",
    "type": "Component",
    "area": "Imposition",
    "status": "Live",
    "path": "src/components/ImpositionModal.tsx",
    "url": "",
    "description": "Backoffice-scherm om bestanden in te slaan op een vel: standaard 4 op SRA3, snijlijnen en 2 mm afloop, instelbaar. Rekenwerk in src/utils/imposition.ts (pdf-lib).",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 50
  },
  {
    "id": "catalogus",
    "name": "Productcatalogus",
    "type": "Component",
    "area": "Catalogus",
    "status": "Bezig",
    "path": "catalog.ts",
    "url": "",
    "description": "Haalt producten en prijzen uit Notion, bewaart ze in app_meta (product_catalog_v1) en ververst elk uur. Leeg totdat NOTION_TOKEN is ingesteld.",
    "parentId": "webapp",
    "dependsOn": [
      "notion"
    ],
    "order": 60
  },
  {
    "id": "calc",
    "name": "Prijscalculatoren",
    "type": "Bibliotheek",
    "area": "Catalogus",
    "status": "Live",
    "path": "src/utils/pricing.ts",
    "url": "",
    "description": "Sticker- en bannercalculator volgens FDPBRAIN Printcalculatoren. Tarieven staan vast in de code.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 70
  },
  {
    "id": "opslag",
    "name": "Opslaglaag",
    "type": "Bibliotheek",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Storage-interface met PostgresStorage en LocalFileStorage (local-data.json zonder DATABASE_URL). Eenmalige import van oude orders.json en staff.json.",
    "parentId": "webapp",
    "dependsOn": [
      "neon"
    ],
    "order": 80
  },
  {
    "id": "server",
    "name": "Server (Express)",
    "type": "Bibliotheek",
    "area": "Algemeen",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "Express-server met alle API-routes, inloggen, bestandsuploads en statische client. Gebundeld naar dist/server.cjs.",
    "parentId": "webapp",
    "dependsOn": [
      "opslag"
    ],
    "order": 90
  },
  {
    "id": "kiosk",
    "name": "Kiosk-systeem",
    "type": "Dienst",
    "area": "Kiosk",
    "status": "Live",
    "path": "FDPManifastor/FD-KIOSK-PRINT-SYSTEM",
    "url": "https://fd-kiosk-print-system.onrender.com",
    "description": "Aparte app voor de kopieerstations in Amsterdam, Utrecht en Hoogvliet, met tijdsgebonden afrekenen en backoffice-timer.",
    "parentId": "webapp",
    "dependsOn": [],
    "order": 100
  },
  {
    "id": "t_orders",
    "name": "Tabel orders",
    "type": "Databasetabel",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Alle opdrachten/opdrachtbonnen met klant- en productgegevens, status en tokens voor tracking en uploads.",
    "parentId": "neon",
    "dependsOn": [],
    "order": 200
  },
  {
    "id": "t_order_files",
    "name": "Tabel order_files",
    "type": "Databasetabel",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Door klanten en medewerkers geuploade bestanden (BYTEA) per order en product.",
    "parentId": "neon",
    "dependsOn": [],
    "order": 201
  },
  {
    "id": "t_staff",
    "name": "Tabel staff",
    "type": "Databasetabel",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Medewerkers met backoffice-toegang.",
    "parentId": "neon",
    "dependsOn": [],
    "order": 202
  },
  {
    "id": "t_admin_sessions",
    "name": "Tabel admin_sessions",
    "type": "Databasetabel",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Ingelogde backoffice-sessies (opgeslagen als hash).",
    "parentId": "neon",
    "dependsOn": [],
    "order": 203
  },
  {
    "id": "t_app_meta",
    "name": "Tabel app_meta",
    "type": "Databasetabel",
    "area": "Opslag",
    "status": "Live",
    "path": "storage.ts",
    "url": "",
    "description": "Sleutel/waarde-opslag, o.a. de gecachte productcatalogus en migratievlaggen.",
    "parentId": "neon",
    "dependsOn": [],
    "order": 204
  },
  {
    "id": "e_DATABASE_URL",
    "name": "DATABASE_URL",
    "type": "Omgevingsvariabele",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "",
    "description": "Verbinding met Neon Postgres. Zonder deze waarde gebruikt de app local-data.json.",
    "parentId": "render",
    "dependsOn": [],
    "order": 210
  },
  {
    "id": "e_NOTION_TOKEN",
    "name": "NOTION_TOKEN",
    "type": "Omgevingsvariabele",
    "area": "Hosting",
    "status": "Gepland",
    "path": "",
    "url": "",
    "description": "Notion-integratietoken voor de productcatalogus en deze map. Nog in te stellen op Render.",
    "parentId": "render",
    "dependsOn": [],
    "order": 211
  },
  {
    "id": "e_NOTION_PRODUCTS_DATABASE_ID",
    "name": "NOTION_PRODUCTS_DATABASE_ID",
    "type": "Omgevingsvariabele",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "",
    "description": "Optioneel. Standaard de Producten Database.",
    "parentId": "render",
    "dependsOn": [],
    "order": 212
  },
  {
    "id": "e_ADMIN_PASSWORD",
    "name": "ADMIN_PASSWORD",
    "type": "Omgevingsvariabele",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "",
    "description": "Beginwachtwoord voor de backoffice-beheerder.",
    "parentId": "render",
    "dependsOn": [],
    "order": 213
  },
  {
    "id": "e_PUBLIC_APP_ORIGIN",
    "name": "PUBLIC_APP_ORIGIN",
    "type": "Omgevingsvariabele",
    "area": "Hosting",
    "status": "Live",
    "path": "",
    "url": "",
    "description": "Basis-URL voor links en QR-codes (status en upload).",
    "parentId": "render",
    "dependsOn": [],
    "order": 214
  },
  {
    "id": "a0",
    "name": "API /api/health",
    "type": "API-route",
    "area": "Algemeen",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "GET. Statuscheck, toont gebruikte opslag (postgres of bestand).",
    "parentId": "server",
    "dependsOn": [],
    "order": 220
  },
  {
    "id": "a1",
    "name": "API /api/catalog",
    "type": "API-route",
    "area": "Catalogus",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "GET producten en prijzen. POST /api/admin/catalog/sync haalt direct opnieuw op uit Notion.",
    "parentId": "server",
    "dependsOn": [],
    "order": 221
  },
  {
    "id": "a2",
    "name": "API /api/auth/*",
    "type": "API-route",
    "area": "Backoffice",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "login, logout en session.",
    "parentId": "server",
    "dependsOn": [],
    "order": 222
  },
  {
    "id": "a3",
    "name": "API /api/staff",
    "type": "API-route",
    "area": "Backoffice",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "Medewerkers lijst, toevoegen en verwijderen.",
    "parentId": "server",
    "dependsOn": [],
    "order": 223
  },
  {
    "id": "a4",
    "name": "API /api/orders",
    "type": "API-route",
    "area": "Backoffice",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "Orders lezen, aanmaken, wijzigen en verwijderen, plus bestanden per order.",
    "parentId": "server",
    "dependsOn": [],
    "order": 224
  },
  {
    "id": "a5",
    "name": "API /api/public/orders/:trackingToken",
    "type": "API-route",
    "area": "Klantpagina",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "Publieke status van een order met ticketblok; update-file voor klantacties.",
    "parentId": "server",
    "dependsOn": [],
    "order": 225
  },
  {
    "id": "a6",
    "name": "API /api/public/orders/:uploadToken/product-files",
    "type": "API-route",
    "area": "Opdrachtbon",
    "status": "Live",
    "path": "server.ts",
    "url": "",
    "description": "Bestand uploaden bij een product (QR of bon).",
    "parentId": "server",
    "dependsOn": [],
    "order": 226
  },
  {
    "id": "map",
    "name": "3D-map (/map)",
    "type": "Pagina",
    "area": "Algemeen",
    "status": "Bezig",
    "path": "src/components/ProjectMap.tsx",
    "url": "",
    "description": "Afgeschermde 3D-weergave van dit register. Leest live uit Notion, met ingebouwde snapshot als reserve.",
    "parentId": "webapp",
    "dependsOn": [
      "server",
      "notion"
    ],
    "order": 300
  },
  {
    "id": "reg",
    "name": "FDP Register (Notion)",
    "type": "Document",
    "area": "Algemeen",
    "status": "Live",
    "path": "",
    "url": "https://app.notion.com/p/41aaf2f5e66c81899d0ed61ad3d6e9a4",
    "description": "Het Notion-register en logboek waaruit de map wordt opgebouwd.",
    "parentId": "webapp",
    "dependsOn": [
      "notion"
    ],
    "order": 301
  }
];
