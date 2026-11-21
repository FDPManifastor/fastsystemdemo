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

## 3D-map van de website (`/map`)

`/map` toont het FDP Register (Notion: FD Printing Center → FDP Register → Register) als draaibare 3D-map: gebieden en onderdelen als punten, "hoort bij" als vaste lijn en "hangt af van" als gestreepte lijn. Klik op een punt voor beschrijving, pad in de repo en links; zoek of filter op gebied.

- De pagina is alleen voor beheer: zonder geldige backoffice-sessie vraagt hij om het backoffice-wachtwoord, en de gegevens (`/api/admin/map`) zijn alleen met sessie op te halen. De pagina is `noindex`.
- Gegevens komen live uit Notion met dezelfde `NOTION_TOKEN` als de productcatalogus. Deel daarvoor de pagina "FDP Register" met de integratie (••• → Verbindingen). Optioneel: `NOTION_REGISTER_DATABASE_ID` (standaard de database "Register").
- Zonder token of bij een Notion-fout toont de map de ingebouwde snapshot (`registerSnapshot.ts`) en meldt dat bovenin.
- Het register in Notion is de bron: pas je daar iets aan, dan verschijnt het binnen een minuut in de map ("Vernieuwen" haalt direct opnieuw op).

## Producten en prijzen uit Notion

De opdrachtbon zoekt tijdens het typen in de productendatabase van FDPBRAIN (Notion → Producten Database → "Producten — Lightspeed X-Series") en toont de verkoopprijs incl. btw.

- `NOTION_TOKEN`: token van een Notion-integratie (notion.so/profile/integrations) die via "Verbindingen" toegang heeft gekregen tot de pagina "Producten Database". Zet dit als secret op Render.
- `NOTION_PRODUCTS_DATABASE_ID`: optioneel; standaard de FDPBRAIN-productendatabase.
- De catalogus wordt in de database bewaard en elk uur ververst. Direct verversen kan (ingelogd) met `POST /api/admin/catalog/sync`. Controleren: `/api/catalog` toont `configured`, `count`, `syncedAt` en een eventuele `error`.

De sticker- en bannercalculator (`src/utils/pricing.ts`) gebruikt dezelfde tarieven als de "Printcalculatoren" in FDPBRAIN → Calculators. Wijzigen de tarieven daar, pas ze dan ook in dat bestand aan.

## Webshopbestellingen uit n8n (`POST /api/integrations/weborders`)

De n8n-workflow "Mail Agent FD Weborders" sorteert de WooCommerce-bestelmails per filiaal. Na het doorsturen naar het filiaal stuurt n8n de mail ook naar FD Werkplaats, waar hij meteen een opdracht wordt bij dat filiaal (bonnummer `WEB-<webshopnummer>`, medewerker "Webshop").

- `WEBORDER_API_KEY`: geheime sleutel (minimaal 24 tekens, bv. `openssl rand -hex 32`). Zet hem als secret op Render en in n8n als header `x-fdp-key`.
- Body (JSON): `branch` (`Amsterdam`, `Utrecht` of `Hoogvliet`), `subject`, `html` (de bestelmail) en optioneel `replyTo` (e-mail van de klant).
- De server leest uit de mail: ordernummer, klant, adres, producten met opties en prijs, totaal en btw, verzending (Ophalen = Afhalen, anders Bezorgen; Ultraspoed komt in de opmerking) en of er betaald is. Formaten A0–A7 of "50x70 cm" worden herkend; anders staat A4 ingevuld met een interne notitie om het te controleren.
- Dezelfde webshopbestelling wordt nooit twee keer aangemaakt. Mails die geen bestelling zijn krijgen `422` en maken niets aan.

## Secure Deployment

Configure these environment variables in the hosting service. Never commit the admin password or put it in frontend code.

- `DATABASE_URL`: Neon/Postgres connection string (see above). Store it as a Render secret.
- `ADMIN_PASSWORD`: generate a unique secret with `openssl rand -base64 32` and store it as a Render secret.
- `PUBLIC_APP_ORIGIN`: the exact public origin, for example `https://your-service.onrender.com`.
- `NODE_ENV`: `production`.
- `WEBORDER_API_KEY`: sleutel voor webshopbestellingen uit n8n (zie hierboven).

For Render, use `npm ci && npm run build` as the build command and `npm start` as the start command. Render provides `PORT` automatically.

Admin sessions are stored in the database, so staff stay logged in across restarts and deploys (sessions expire after 8 hours of inactivity). Each product on a new opdrachtbon has its own QR code and upload link; customer uploads (PDF, PNG, or JPG up to 4 MB each) are tagged with that product and shown in the backoffice. Customer upload links contain bearer tokens: share them only with the intended customer.
