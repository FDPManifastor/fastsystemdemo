<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6f723b3a-e31b-4e6d-8295-e9a739eb650b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Opslag (database)

Orders, klantbestanden, medewerkers en admin-sessies worden opgeslagen in een Postgres-database (Neon).

- `DATABASE_URL`: de connection string van de Neon-database (begint met `postgresql://`, eindigt op `?sslmode=require`). Zet deze als environment variable op Render.
- De tabellen worden bij de eerste start automatisch aangemaakt. Staan er nog orders in een oude `orders.json` of medewerkers in `staff.json`, dan worden die eenmalig overgezet.
- Zonder `DATABASE_URL` (lokaal ontwikkelen) gebruikt de app het bestand `local-data.json` in de werkmap. Dat bestand staat in `.gitignore`.
- Controleren of de database werkt: open `/api/health`. Je ziet dan `{"ok":true,"storage":"postgres"}`.

De opslaglogica staat in `storage.ts`; `server.ts` gebruikt alleen die functies.

## Producten en prijzen uit Notion

De opdrachtbon zoekt tijdens het typen in de productendatabase van FDPBRAIN (Notion → Producten Database → "Producten — Lightspeed X-Series") en toont de verkoopprijs incl. btw.

- `NOTION_TOKEN`: token van een Notion-integratie (notion.so/profile/integrations) die via "Verbindingen" toegang heeft gekregen tot de pagina "Producten Database". Zet dit als secret op Render.
- `NOTION_PRODUCTS_DATABASE_ID`: optioneel; standaard de FDPBRAIN-productendatabase.
- De catalogus wordt in de database bewaard en elk uur ververst. Direct verversen kan (ingelogd) met `POST /api/admin/catalog/sync`. Controleren: `/api/catalog` toont `configured`, `count`, `syncedAt` en een eventuele `error`.

De sticker- en bannercalculator (`src/utils/pricing.ts`) gebruikt dezelfde tarieven als de "Printcalculatoren" in FDPBRAIN → Calculators. Wijzigen de tarieven daar, pas ze dan ook in dat bestand aan.

## Secure Deployment

Configure these environment variables in the hosting service. Never commit the admin password or put it in frontend code.

- `DATABASE_URL`: Neon/Postgres connection string (see above). Store it as a Render secret.
- `ADMIN_PASSWORD`: generate a unique secret with `openssl rand -base64 32` and store it as a Render secret.
- `PUBLIC_APP_ORIGIN`: the exact public origin, for example `https://your-service.onrender.com`.
- `NODE_ENV`: `production`.

For Render, use `npm ci && npm run build` as the build command and `npm start` as the start command. Render provides `PORT` automatically.

Admin sessions are stored in the database, so staff stay logged in across restarts and deploys (sessions expire after 8 hours of inactivity). Each product on a new opdrachtbon has its own QR code and upload link; customer uploads (PDF, PNG, or JPG up to 4 MB each) are tagged with that product and shown in the backoffice. Customer upload links contain bearer tokens: share them only with the intended customer.
