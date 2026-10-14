import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileDown, Inbox, LockKeyhole, LogOut, RefreshCw, Search } from 'lucide-react';

type OrderRecord = {
  id: string;
  createdAt?: string;
  status?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientReference?: string;
  clientComments?: string;
  clientQuantity?: number;
  selectedProductName?: string;
  customWidth?: number;
  customHeight?: number;
  printSides?: 'single' | 'double';
  frontFileName?: string;
  backFileName?: string;
  imageSrcUrl?: string | null;
  backImageSrcUrl?: string | null;
};

const ACCESS_CODE_KEY = 'fd_orders_access_code';

export default function OrdersPage() {
  const [accessCode, setAccessCode] = useState(() => sessionStorage.getItem(ACCESS_CODE_KEY) || '');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOrders = async (code: string) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        headers: { Authorization: code },
      });
      const data = await response.json();
      if (!response.ok) {
        sessionStorage.removeItem(ACCESS_CODE_KEY);
        setIsAuthenticated(false);
        setOrders([]);
        setError(data.error || 'Toegang geweigerd. Controleer het beheerderswachtwoord.');
        return;
      }
      sessionStorage.setItem(ACCESS_CODE_KEY, code);
      setAccessCode(code);
      setOrders(data);
      setIsAuthenticated(true);
      setLastUpdated(new Date());
    } catch {
      setError('De orderserver is niet bereikbaar. Probeer het opnieuw.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedCode = sessionStorage.getItem(ACCESS_CODE_KEY);
    if (savedCode) void loadOrders(savedCode);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshTimer = window.setInterval(() => void loadOrders(accessCode), 20000);
    return () => window.clearInterval(refreshTimer);
  }, [accessCode, isAuthenticated]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return orders;
    return orders.filter((order) => [
      order.id,
      order.clientName,
      order.clientEmail,
      order.clientReference,
      order.selectedProductName,
      order.status,
    ].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [orders, search]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accessCode.trim()) void loadOrders(accessCode.trim());
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ACCESS_CODE_KEY);
    setAccessCode('');
    setIsAuthenticated(false);
    setOrders([]);
  };

  const formatDate = (date?: string) => {
    if (!date) return 'Onbekend';
    const parsedDate = new Date(date);
    return Number.isNaN(parsedDate.getTime()) ? 'Onbekend' : parsedDate.toLocaleString('nl-NL');
  };

  const renderFileLink = (url: string | null | undefined, fileName: string | undefined, fallback: string) => {
    if (!url) return <span className="text-slate-400">Geen bestand</span>;
    const mimeType = url.match(/^data:([^;,]+)/)?.[1];
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : null;
    const downloadName = extension
      ? `${(fileName || fallback).replace(/\.[^.]+$/, '')}.${extension}`
      : fileName || fallback;
    return (
      <a
        href={url}
        download={downloadName}
        className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
      >
        <FileDown className="h-4 w-4 shrink-0" />
        <span className="truncate">{fileName || fallback}</span>
      </a>
    );
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-7 py-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-red-700">FD Printing</p>
            <h1 className="mt-1 text-2xl font-bold">Orders inbox</h1>
            <p className="mt-2 text-sm text-slate-500">Log in om binnengekomen opdrachten en bestanden te bekijken.</p>
          </header>
          <form onSubmit={handleLogin} className="space-y-4 px-7 py-6">
            <label className="block text-sm font-semibold" htmlFor="orders-access-code">Beheerderswachtwoord</label>
            <input
              id="orders-access-code"
              type="password"
              autoComplete="current-password"
              required
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="Wachtwoord"
            />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {isLoading ? 'Controleren...' : 'Inloggen'}
            </button>
            <a href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              Terug naar de hoofdportal <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-700 text-white"><Inbox className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase text-red-700">FD Printing</p>
              <h1 className="text-xl font-bold">Orders inbox</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="hidden items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex">
              Hoofdportal <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button onClick={() => void loadOrders(accessCode)} disabled={isLoading} title="Orders vernieuwen" className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Uitloggen</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Totaal opdrachten</p>
            <p className="mt-2 text-3xl font-bold">{orders.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Nieuwste opdracht</p>
            <p className="mt-2 text-lg font-bold">{orders[0]?.id || 'Nog geen orders'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Bijgewerkt</p>
                    <p className="mt-2 text-lg font-bold">{lastUpdated?.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) || 'Nog niet bijgewerkt'}</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold">Binnengekomen opdrachten</h2>
              <p className="mt-1 text-sm text-slate-500">Bestanden bekijken en downloaden voor verwerking.</p>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek op order, klant of product" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600" />
            </label>
          </div>

          {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          {isLoading && orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">Orders laden...</div>
          ) : visibleOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-semibold">{orders.length ? 'Geen resultaten' : 'Nog geen opdrachten ontvangen'}</p>
              <p className="mt-1 text-sm text-slate-500">Nieuwe klantinzendingen verschijnen hier.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {visibleOrders.map((order) => (
                <article key={order.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{order.id}</h3>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{order.status || 'Ingediend'}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(order.createdAt)}</p>
                    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs font-semibold uppercase text-slate-400">Klant</dt><dd className="font-medium">{order.clientName || 'Onbekend'}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-400">E-mail</dt><dd className="break-all font-medium">{order.clientEmail || 'Niet opgegeven'}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-400">Product</dt><dd className="font-medium">{order.selectedProductName || 'Op maat'}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-400">Formaat / oplage</dt><dd className="font-medium">{order.customWidth || '?'} × {order.customHeight || '?'} mm · {order.clientQuantity || '?'} stuks</dd></div>
                    </dl>
                    {order.clientComments && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{order.clientComments}</p>}
                  </div>
                  <div className="space-y-3 rounded-md bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">Bestand en voorbeeld</p>
                    <div>{renderFileLink(order.imageSrcUrl, order.frontFileName, `${order.id}_voorzijde`)}</div>
                    {order.printSides === 'double' && <div>{renderFileLink(order.backImageSrcUrl, order.backFileName, `${order.id}_achterzijde`)}</div>}
                    {order.imageSrcUrl && <a href={order.imageSrcUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border border-slate-200 bg-white">
                      <img src={order.imageSrcUrl} alt={`Bestandsvoorbeeld ${order.frontFileName || order.id}`} className="h-36 w-full object-contain" loading="lazy" />
                    </a>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
