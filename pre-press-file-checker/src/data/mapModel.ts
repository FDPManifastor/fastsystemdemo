/**
 * Gegevens voor de overzichtskaart (/map): onderdelen van de FDP WebApp, wat ze doen,
 * en de openstaande taken (uit analyses, tests en ideeën).
 * Taakstatussen en eigen ideeën worden apart in de database bewaard (app_meta 'map_state_v1').
 */

export type TaskStatus = 'Idee' | 'Te doen' | 'Bezig' | 'Klaar' | 'Niet doen';
export const TASK_STATUSES: TaskStatus[] = ['Idee', 'Te doen', 'Bezig', 'Klaar', 'Niet doen'];
export type TaskSource = 'Juridisch en privacy' | 'Beveiliging' | 'Website-analyse' | 'Testen na deploy' | 'Toekomst' | 'Suggestie' | 'Eigen idee';
export type Priority = 'Hoog' | 'Middel' | 'Laag';

export type MapTask = {
  id: string;
  nodeId: string;
  title: string;
  what: string;
  where?: string;
  source: TaskSource;
  priority: Priority;
  effort: 'Quick win' | 'Groot';
  status: TaskStatus;
  custom?: boolean;
  createdAt?: string;
};

export type NodeStatus = 'Live' | 'Te testen na deploy' | 'Gepland';
export type WireKind = 'login' | 'overzicht' | 'opdrachten' | 'bon' | 'klant' | 'upload' | 'prepress' | 'imposition' | 'bestanden' | 'personeel' | 'kiosk' | '';

export type MapNodeInfo = {
  id: string;
  layer: string;
  name: string;
  summary: string;
  functions: string[];
  status: NodeStatus;
  path?: string;
  url?: string;
  dependsOn?: string[];
  wire?: WireKind;
};

export const LAYERS: Array<{ id: string; title: string; hint: string }> = [
  { id: 'klanten', title: '1. Wat klanten zien', hint: 'Pagina’s voor klanten: uploaden en de status volgen.' },
  { id: 'werkplaats', title: '2. FD Werkplaats (medewerkers)', hint: 'Alles waar medewerkers en de beheerder mee werken na het inloggen.' },
  { id: 'gereedschap', title: '3. Gereedschap', hint: 'Hulpmiddelen die in de schermen worden gebruikt.' },
  { id: 'server', title: '4. Server en gegevens', hint: 'De achterkant: beveiliging, opslag en koppelingen.' },
  { id: 'hosting', title: '5. Hosting en diensten', hint: 'Waar alles draait en wat daaraan hangt.' },
];

export const NODES: MapNodeInfo[] = [
  {
    id: 'upload', layer: 'klanten', name: 'Bestand uploaden (QR of link)', status: 'Live', wire: 'upload',
    summary: 'De klant stuurt een bestand voor een bonregel vanaf zijn telefoon of later via een uploadlink.',
    functions: ['Medewerker toont een QR-code op de bon', 'Klant scant en kiest een pdf, png of jpg', 'Bestand verschijnt direct bij de bonregel', 'Na het opslaan van de bon: aanleveren via de uploadlink per product', 'Uploadcode geldt 8 uur'],
    path: 'src/components/DraftUploadPage.tsx, TicketProductUploadPortal.tsx', url: '/upload', dependsOn: ['server'],
  },
  {
    id: 'klant', layer: 'klanten', name: 'Klantstatuspagina', status: 'Live', wire: 'klant',
    summary: 'De klant ziet via een persoonlijke link of QR-code hoe zijn opdracht ervoor staat.',
    functions: ['Toont de status (ingediend, in druk, klaar voor afhalen …)', 'Toont openstaande acties voor de klant', 'Klant kan een bestand vervangen', 'Interne notities en medewerkersnamen zijn niet zichtbaar'],
    path: 'src/App.tsx', url: '/?order=…', dependsOn: ['server', 'tabellen'],
  },

  {
    id: 'login', layer: 'werkplaats', name: 'Inloggen', status: 'Live', wire: 'login',
    summary: 'Medewerkers kiezen hun filiaal en loggen in; de beheerder logt in als Beheerder.',
    functions: ['Snelkoppeling per filiaal (?filiaal=Amsterdam, Utrecht of Hoogvliet)', 'Eén wachtwoord per filiaal, of een eigen wachtwoord per persoon', 'Sessie duurt maximaal 8 uur', 'Per filiaal alleen de eigen opdrachten zichtbaar'],
    path: 'src/App.tsx', url: '/backoffice', dependsOn: ['auth'],
  },
  {
    id: 'overzicht', layer: 'werkplaats', name: 'Overzicht', status: 'Te testen na deploy', wire: 'overzicht',
    summary: 'Eerste scherm na het inloggen: wat er open staat en wie waarmee bezig is.',
    functions: ['Open opdrachten, betalingen en klantcontact in één blik', 'Teamtabel: per persoon bezig, klaargezet, afgerond en hulpvragen (met periodefilter)', 'Lijst met openstaande hulpvragen', 'Melding bovenaan als iemand jou om hulp vraagt'],
    path: 'src/components/BackofficeOverview.tsx', dependsOn: ['orders'],
  },
  {
    id: 'opdrachten', layer: 'werkplaats', name: 'Opdrachten', status: 'Te testen na deploy', wire: 'opdrachten',
    summary: 'Alle opdrachten als kaarten. Klik op een kaart om alles te zien en te beheren.',
    functions: ['Kaart opent bij klik; toont wie ermee bezig is en de voortgang (afvinklijst)', '“Ik pak dit op” en de keuze “Ik ben” (naam in het logboek)', 'Status wijzigen, betaling vastleggen, notitie toevoegen', 'Hulp vragen aan een collega (accepteren of afwijzen)', 'Extra info en extra bijlagen bij de productspecificatie', 'Delen met een ander filiaal of verplaatsen', 'Opslaan op computer (map met bon en bestanden)', 'Klant per e-mail inlichten', 'Bestanden van de klant: zie Pre-press en Imposeren'],
    path: 'src/App.tsx, src/components/OrderExtras.tsx', dependsOn: ['orders', 'bestanden'],
  },
  {
    id: 'bon', layer: 'werkplaats', name: 'Opdrachtbon', status: 'Te testen na deploy', wire: 'bon',
    summary: 'Nieuwe opdracht aanmaken op het scherm, in de stijl van de papieren bon.',
    functions: ['Product zoeken uit de catalogus terwijl je typt', 'Knop “Product berekenen” voor eigen formaat, aantal en prijs (selfservice-printstaffel, sticker- en bannercalculator)', 'Bestand toevoegen via apparaat of QR-code, met pre-press check', 'Naam van wie hielp is verplicht', 'Concept blijft 8 uur bewaard', 'Bon afdrukken of mailen; QR-code naar de klantstatuspagina', 'Footer met adres van het gekozen filiaal'],
    path: 'src/components/OrderTicketWorkspace.tsx', dependsOn: ['catalogus', 'calc', 'prepress', 'orders'],
  },
  {
    id: 'bestanden', layer: 'werkplaats', name: 'Bestanden van de klant', status: 'Te testen na deploy', wire: 'bestanden',
    summary: 'Per klantbestand: eerst pre-press check, daarna imposeren. Het origineel blijft altijd bewaard.',
    functions: ['Stap 1: pre-press check (formaat kiezen, controleren, op maat zetten)', 'Stap 2: imposeren op SRA3 (werkt pas na de check)', 'Origineel downloaden en het op maat gezette bestand downloaden', 'Print-ready bestand bewaren voor de drukker', 'Recht “Pre-press” is nodig'],
    path: 'src/components/OrderExtras.tsx (CustomerFilesBox)', dependsOn: ['prepress', 'imposition', 'orders'],
  },
  {
    id: 'personeel', layer: 'werkplaats', name: 'Personeel en rechten (alleen beheerder)', status: 'Live', wire: 'personeel',
    summary: 'De beheerder beheert medewerkers, filialen, wachtwoorden en rechten.',
    functions: ['Medewerkers toevoegen en aan een filiaal koppelen', 'Wachtwoord per filiaal en per persoon instellen', 'Rechten per filiaal: bon maken, status wijzigen, bon aanpassen, betaling, bestanden, pre-press'],
    path: 'src/App.tsx', dependsOn: ['auth', 'tabellen'],
  },

  {
    id: 'prepress', layer: 'gereedschap', name: 'Pre-press check (Pre-flight Canvas Monitor)', status: 'Te testen na deploy', wire: 'prepress',
    summary: 'Controleert en zet een bestand op maat voordat het geïmposeerd of gedrukt wordt.',
    functions: ['Voorbeeld met afloop (3 mm bleed) en tekstveilige zone', 'Inpassen, vullend (crop) of vervormen; herstel schaal; verhouding behouden', 'Toon eindresultaat', 'Opslaan als op maat gezet bestand, of “Origineel gebruiken”', 'Werkruimte past zich aan het scherm aan'],
    path: 'src/components/LiveFilePreview.tsx, ticket/TicketTools.tsx', dependsOn: [],
  },
  {
    id: 'imposition', layer: 'gereedschap', name: 'Imposeren (inslaan op SRA3)', status: 'Te testen na deploy', wire: 'imposition',
    summary: 'Zet meerdere exemplaren van één ontwerp op één vel.',
    functions: ['Formaten A8 t/m A3, standaard SRA3', '4 mm tussenruimte, met of zonder snijlijnen', 'Automatisch zoveel mogelijk per vel, handmatig aanpasbaar', 'Voorbeeld en pdf-download', '“Klaar om te printen” bewaart het vel bij de opdracht'],
    path: 'src/components/ImpositionModal.tsx, src/utils/imposition.ts', dependsOn: ['prepress'],
  },
  {
    id: 'calc', layer: 'gereedschap', name: 'Prijscalculatoren', status: 'Te testen na deploy',
    summary: 'Rekenen voor producten die niet standaard in de catalogus staan.',
    functions: ['Sticker- en bannercalculator (Roland SG3-540 tarieven)', 'Selfservice-printstaffel: zwart-wit en kleur, A4 en A3, dikker papier', 'Alle bedragen inclusief 21% btw'],
    path: 'src/utils/pricing.ts', dependsOn: [],
  },
  {
    id: 'catalogus', layer: 'gereedschap', name: 'Productcatalogus (Notion)', status: 'Live',
    summary: 'Producten en prijzen uit FDPBRAIN in Notion, doorzoekbaar op de bon.',
    functions: ['Synchroniseert met de Notion-productendatabase', 'Zoekt “in de buurt” terwijl je typt', 'Neemt prijs, btw en formaat over'],
    path: 'catalog.ts', dependsOn: ['notion'],
  },

  {
    id: 'server', layer: 'server', name: 'Server (Express)', status: 'Live',
    summary: 'De achterkant die alle schermen bedient.',
    functions: ['Beveiligingsheaders, CSP en HSTS', 'Rate limiting op API, inloggen en uploads', 'Controle van herkomst (CSRF) bij elke schrijfactie', 'Levert de app uit (dist)'],
    path: 'server.ts', dependsOn: ['auth', 'orders', 'opslag'],
  },
  {
    id: 'auth', layer: 'server', name: 'Inloggen en rechten (API)', status: 'Live',
    summary: 'Sessies, wachtwoorden en rechten per filiaal.',
    functions: ['scrypt-wachtwoorden en timing-veilige vergelijking', 'Sessies in de database (gehasht), httpOnly cookie', 'Rechten: bon_maken, status_wijzigen, bon_aanpassen, betaling, bestanden, prepress'],
    path: 'server.ts (/api/auth, /api/staff, /api/admin)', dependsOn: ['tabellen'],
  },
  {
    id: 'orders', layer: 'server', name: 'Opdrachten (API)', status: 'Te testen na deploy',
    summary: 'Opdrachten aanmaken, wijzigen, delen en bestanden bewaren.',
    functions: ['Aanmaken, wijzigen, status, betaling, notities, hulpvragen, extra info', 'Bijlagen en pre-press resultaten', 'Publieke routes met tokens voor de klant (status, upload, bestand vervangen)'],
    path: 'server.ts (/api/orders, /api/public/…)', dependsOn: ['opslag'],
  },
  {
    id: 'opslag', layer: 'server', name: 'Opslaglaag', status: 'Live',
    summary: 'Bewaart gegevens in Neon Postgres, of lokaal in een bestand tijdens ontwikkelen.',
    functions: ['Opdrachten (JSON) en bestanden in aparte tabel', 'Medewerkers, sessies en instellingen', 'Lokale terugval zonder database'],
    path: 'storage.ts', dependsOn: ['tabellen'],
  },
  {
    id: 'tabellen', layer: 'server', name: 'Databasetabellen', status: 'Live',
    summary: 'orders, order_files, staff, admin_sessions en app_meta in Neon.',
    functions: ['orders: de opdrachten', 'order_files: geüploade bestanden', 'staff: medewerkers (met filiaal)', 'admin_sessions: ingelogde sessies', 'app_meta: instellingen, wachtwoorden en deze kaart'],
    path: 'storage.ts', dependsOn: ['neon'],
  },

  {
    id: 'render', layer: 'hosting', name: 'Render', status: 'Live',
    summary: 'Hosting van de app. Deploy gebeurt handmatig.',
    functions: ['Build: npm install && npm run build', 'Gratis plan: slaapt na inactiviteit', 'Omgevingsvariabelen (o.a. DATABASE_URL, ADMIN_PASSWORD, NOTION_TOKEN)'],
    url: 'https://fastsystemdemo.onrender.com', dependsOn: ['github'],
  },
  { id: 'neon', layer: 'hosting', name: 'Neon Postgres', status: 'Live', summary: 'De database (Frankfurt).', functions: ['Bewaart alle tabellen', 'Verbinding via DATABASE_URL'], dependsOn: [] },
  { id: 'github', layer: 'hosting', name: 'GitHub', status: 'Live', summary: 'De code: FDPManifastor/fastsystemdemo.', functions: ['Alles op de main-tak; staging-tak bestaat al', 'Codespace voor later'], url: 'https://github.com/FDPManifastor/fastsystemdemo', dependsOn: [] },
  { id: 'notion', layer: 'hosting', name: 'Notion (FDPBRAIN)', status: 'Live', summary: 'Producten, Register en Logboek.', functions: ['Productendatabase voor de catalogus', 'FDP Register en Logboek van wijzigingen'], dependsOn: [] },
  { id: 'kiosk', layer: 'hosting', name: 'Kiosk-systeem (selfservice)', status: 'Live', wire: 'kiosk', summary: 'Aparte omgeving voor de selfservice-pc’s in de winkels.', functions: ['Tijdsgebonden gebruik (€ 0,95 eerste 10 min, daarna € 0,05 per minuut)', 'Prijslijst en staffels voor printen, posters, inbinden en lamineren', 'Stations in Amsterdam, Utrecht en Hoogvliet'], url: 'https://fd-kiosk-print-system.onrender.com', dependsOn: [] },
];

let n = 0;
const T = (nodeId: string, title: string, what: string, source: TaskSource, priority: Priority, effort: 'Quick win' | 'Groot', where?: string, status: TaskStatus = 'Te doen'): MapTask =>
  ({ id: `t${++n}`, nodeId, title, what, where, source, priority, effort, status });

export const TASKS: MapTask[] = [
  // Juridisch en privacy
  T('klant', 'Privacyverklaring publiceren', 'Pagina /privacy met de conceptstekst, link in de footer van upload, statuspagina en bon, plus een korte tekst onder het uploadformulier. Eerst KvK-nummer, privacy-e-mail en adressen invullen. Concept staat in het project (privacyverklaring-concept).', 'Juridisch en privacy', 'Hoog', 'Quick win', 'src/App.tsx, DraftUploadPage.tsx'),
  T('tabellen', 'Bewaartermijnen vastleggen en automatisch opruimen', 'Voorstel: bestanden 3 maanden na afronden, opdrachtgegevens 12 maanden, administratie 7 jaar. Dagelijkse opruiming bouwen met een logregel per verwijdering.', 'Juridisch en privacy', 'Hoog', 'Groot', 'storage.ts, server.ts'),
  T('hosting', 'Verwerkersovereenkomsten en verwerkingsregister', 'DPA afsluiten met Render, Neon, Notion, Moneybird en de e-mailprovider. Render-regio controleren (liefst Frankfurt). Verwerkingsregister aanmaken.', 'Juridisch en privacy', 'Middel', 'Quick win'),
  T('bon', 'Concept-bon wissen bij uitloggen', 'Het concept (met klantgegevens) staat tot 8 uur in localStorage op de balie-pc. Wissen bij uitloggen.', 'Juridisch en privacy', 'Middel', 'Quick win', 'OrderTicketWorkspace.tsx, App.tsx'),
  T('server', 'Medewerkerslijst afschermen', '/api/public/staff en /api/public/staff-login geven namen en filialen zonder inlog. Beperken tot een ingelogde sessie of alleen het gekozen filiaal.', 'Beveiliging', 'Middel', 'Quick win', 'server.ts'),
  T('orders', 'Uploads controleren op echte inhoud', 'Eerste bytes van pdf, png en jpg controleren in plaats van alleen het opgegeven type.', 'Beveiliging', 'Middel', 'Quick win', 'server.ts'),
  T('github', 'Lockfile herstellen en npm audit', 'pdf-lib en pg ontbreken in package-lock.json en bun.lock ligt ernaast. npm install in de Codespace, committen en npm audit draaien.', 'Beveiliging', 'Middel', 'Quick win', 'package-lock.json'),
  T('notion', 'Notion-token beperken', 'Het token alleen toegang geven tot de productdatabase. De kiosk-site apart laten controleren.', 'Beveiliging', 'Middel', 'Quick win'),
  T('server', 'CSP aanscherpen en extra headers', 'unsafe-inline uit style-src; Cross-Origin-Opener-Policy en Resource-Policy toevoegen.', 'Beveiliging', 'Laag', 'Groot', 'server.ts'),
  T('github', 'Licentie-overzicht en opruimen', 'THIRD-PARTY-NOTICES met licentieteksten (DM Sans OFL, dompurify als Apache-2.0). @google/genai verwijderen als het ongebruikt blijkt. MFA aanzetten op GitHub, Render, Neon en Notion.', 'Juridisch en privacy', 'Laag', 'Quick win'),
  // Website-analyse
  T('server', 'Caching: gehashte bestanden lang bewaren', 'Nu staat overal no-store. /assets/* op public, max-age=31536000, immutable; index.html en de API blijven no-store.', 'Website-analyse', 'Hoog', 'Quick win', 'server.ts'),
  T('server', 'Compressie toevoegen', 'gzip of brotli. Eerst controleren of Render al comprimeert.', 'Website-analyse', 'Middel', 'Quick win', 'server.ts'),
  T('server', 'Backoffice verbergen voor Google', 'X-Robots-Tag: noindex op /backoffice, /api en /map, plus public/robots.txt.', 'Website-analyse', 'Middel', 'Quick win', 'server.ts, public/'),
  T('render', 'Slaapstand van Render oplossen', 'Gratis pinger (elke 5 minuten) of betaald plan (circa 7 dollar per maand). De eerste bezoeker wacht nu 30–60 seconden.', 'Website-analyse', 'Hoog', 'Quick win'),
  T('klant', 'Taal en metatags', 'lang="nl", meta description, per pagina een eigen titel, noscript-tekst.', 'Website-analyse', 'Laag', 'Quick win', 'index.html'),
  T('opdrachten', 'Toegankelijkheid verbeteren', 'aria-labels op icoonknoppen, focus-trap en Escape in modals, zichtbare focus, kleurcontrast, geen tekst kleiner dan 12 px (nu ruim 200 plekken).', 'Website-analyse', 'Middel', 'Groot', 'src/'),
  T('server', 'App.tsx opsplitsen', 'App.tsx is circa 5.600 regels. Backoffice los van klantpagina’s laden.', 'Website-analyse', 'Laag', 'Groot', 'src/App.tsx'),
  T('orders', 'Uploads als multipart', 'Nu base64 in JSON (+33%). Multipart is sneller voor grote pdf’s.', 'Website-analyse', 'Laag', 'Groot', 'server.ts'),
  // Toekomst
  T('render', 'Testomgeving (staging) op Render', 'Tweede service fastsystemdemo-staging op de staging-tak, eigen ADMIN_PASSWORD, geen DATABASE_URL. Wijzigingen eerst daar tonen.', 'Toekomst', 'Middel', 'Groot'),
  T('overzicht', 'Meer inzicht in het overzicht', 'Gemiddelde doorlooptijd per product, omzet per filiaal (vandaag/week), opdrachten die langer dan 3 dagen stilstaan, terugkerende klanten.', 'Toekomst', 'Laag', 'Groot', 'BackofficeOverview.tsx'),
  T('opdrachten', 'Word en Excel als bijlage', 'Nu alleen pdf, png en jpg.', 'Toekomst', 'Laag', 'Quick win', 'server.ts, OrderExtras.tsx'),
  T('opdrachten', 'Kleine knoppen vergroten (touchscreen)', 'Resterende kleine knoppen in de opdrachtkaarten minimaal 44 × 44 px.', 'Toekomst', 'Middel', 'Quick win', 'App.tsx'),
  T('login', 'Automatisch uitloggen bij inactiviteit', 'Voor de balie-pc’s.', 'Toekomst', 'Laag', 'Quick win', 'App.tsx'),
  T('login', 'Inloggen per persoon in beeld brengen', 'De code bestaat, de keuze is nu verborgen.', 'Toekomst', 'Laag', 'Quick win', 'App.tsx'),
  T('calc', 'Overige formaten in de printstaffel', 'A5, A6, A7 en A8 (per A4-vel of eigen tarief); nog bepalen hoe.', 'Toekomst', 'Laag', 'Quick win', 'pricing.ts'),
  T('calc', 'Poster- en boekjescalculators; tarieven uit code halen', 'Tarieven staan hardcoded in pricing.ts. Posters en boekjes ontbreken.', 'Toekomst', 'Laag', 'Groot', 'pricing.ts'),
  T('catalogus', '242 Notion-producten zonder prijs aanvullen', 'Producten zonder prijs verschijnen lager in de zoekresultaten.', 'Toekomst', 'Middel', 'Groot'),
  // Testen na deploy
  T('opdrachten', 'Testen: kaart, hulpvragen en “Ik ben”', 'Kaart opent bij klik, “Ik pak dit op”, afvinklijst, hulp vragen (aanvragen, accepteren, kan niet, klaar), melding bovenaan, namen in logboek en teamoverzicht.', 'Testen na deploy', 'Hoog', 'Quick win'),
  T('bestanden', 'Testen: pre-press, imposeren en bestanden', 'Pre-press check per klantbestand, origineel blijft bewaard, imposeren op het gecontroleerde bestand, extra info en bijlagen, Opslaan op computer.', 'Testen na deploy', 'Hoog', 'Quick win'),
  T('bon', 'Testen: Product berekenen en selfservice-staffel', 'Paneel openen/sluiten, aantal en prijs, sticker- en bannercalculator, bon opslaan met bestand en pre-press.', 'Testen na deploy', 'Hoog', 'Quick win'),
  T('tabellen', 'Testen: Postgres-kolom branch bij personeel', 'ALTER TABLE staff ADD COLUMN branch controleren op Neon.', 'Testen na deploy', 'Hoog', 'Quick win'),
  T('server', 'Testen: bouwlog en chunkgroottes', 'Controleren of de code-splitting werkt in de Render build-log.', 'Testen na deploy', 'Laag', 'Quick win'),
  // Suggesties op basis van de kaart
  T('bon', 'Sjablonen voor veelvoorkomende opdrachten', 'Bijvoorbeeld “100 flyers A5”: een klik vult product, formaat, aantal en prijs in.', 'Suggestie', 'Laag', 'Groot', undefined, 'Idee'),
  T('imposition', 'Imposeer-sjablonen per product opslaan', 'Aantal per vel en tussenruimte onthouden per product, zodat medewerkers niets hoeven in te stellen.', 'Suggestie', 'Laag', 'Quick win', undefined, 'Idee'),
  T('klant', 'Klant keurt drukproef goed via de statuspagina', 'De klant ziet de gecontroleerde versie en keurt goed of vraagt een wijziging.', 'Suggestie', 'Middel', 'Groot', undefined, 'Idee'),
  T('kiosk', 'Bestand van de kiosk direct als opdracht starten', 'Een klant die op de kiosk een bestand heeft, kan daar meteen een opdrachtbon voor laten maken.', 'Suggestie', 'Laag', 'Groot', undefined, 'Idee'),
  T('opdrachten', 'Geluid of melding bij nieuwe hulpvraag', 'Op tablets in de werkplaats: een duidelijke melding als iemand hulp vraagt.', 'Suggestie', 'Laag', 'Quick win', undefined, 'Idee'),
  T('tabellen', 'Dagelijkse back-up van de gegevens', 'Een export van de opdrachten en bestanden bewaren buiten Neon.', 'Suggestie', 'Middel', 'Groot', undefined, 'Idee'),
  T('render', 'Bewaking: melding als de site uitvalt', 'Een gratis uptime-monitor die een e-mail stuurt bij storing.', 'Suggestie', 'Laag', 'Quick win', undefined, 'Idee'),
];
