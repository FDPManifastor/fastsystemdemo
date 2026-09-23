import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let Express parse JSON up to 150MB to easily accommodate multiple high-res design photos/PDFs
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  const ORDERS_FILE = path.join(process.cwd(), "orders.json");

  // Load orders helper
  function loadOrders() {
    try {
      if (fs.existsSync(ORDERS_FILE)) {
        const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading orders database:", e);
    }
    return [];
  }

  // Save orders helper
  function saveOrders(orders: any[]) {
    try {
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving orders database:", e);
    }
  }

  const STAFF_FILE = path.join(process.cwd(), "staff.json");

  // Load staff helper
  function loadStaff() {
    try {
      if (fs.existsSync(STAFF_FILE)) {
        const raw = fs.readFileSync(STAFF_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading staff database:", e);
    }
    // Default staff if empty
    return [
      { id: "S1", name: "Jan de Wilde", role: "Pre-press Specialist" },
      { id: "S2", name: "Sara Bakker", role: "Order Manager" },
      { id: "S3", name: "Mo El Hamdi", role: "Druk Operator" }
    ];
  }

  // Save staff helper
  function saveStaff(staff: any[]) {
    try {
      fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving staff database:", e);
    }
  }

  // API Staff Routes (authorized with admin password)
  app.get("/api/staff", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }
    res.json(loadStaff());
  });

  app.post("/api/staff", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }
    const { name, role } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: "Naam en rol zijn verplicht." });
    }
    const staff = loadStaff();
    const newMember = {
      id: "S-" + Math.floor(1000 + Math.random() * 9000),
      name,
      role
    };
    staff.push(newMember);
    saveStaff(staff);
    res.json(newMember);
  });

  app.delete("/api/staff/:id", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }
    const staff = loadStaff();
    const filtered = staff.filter((m: any) => m.id !== req.params.id);
    saveStaff(filtered);
    res.json({ success: true });
  });

  // API Route: Get all orders (admin password credentials authorization)
  app.get("/api/orders", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }
    const orders = loadOrders();
    res.json(orders);
  });

  // API Route: Get single order by id (public for QR code tracking)
  app.get("/api/orders/:id", (req, res) => {
    const orders = loadOrders();
    const order = orders.find((o: any) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order niet gevonden." });
    }
    res.json(order);
  });

  // API Route: Save a new order submission
  app.post("/api/orders", (req, res) => {
    const { orderData } = req.body;
    if (!orderData || !orderData.clientName || !orderData.clientEmail) {
      return res.status(400).json({ error: "Klantnaam en e-mailadres zijn verplichte velden." });
    }

    const orderId = "FD-" + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: "Ingediend",
      history: [
        {
          date: new Date().toISOString(),
          status: "Ingediend",
          note: "Uw preflight-gevalideerde opdracht is ontvangen en staat in de wachtrij van FD Printing."
        }
      ],
      ...orderData
    };

    const currentOrders = loadOrders();
    currentOrders.unshift(newOrder); // Prepend new submission
    saveOrders(currentOrders);

    res.json({ success: true, orderId: newOrder.id });
  });

  // API Route: Update an order status / notes (admin authorization)
  app.put("/api/orders/:id", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }

    const { status, note, assignedStaff } = req.body;
    const orderId = req.params.id;
    const orders = loadOrders();
    const idx = orders.findIndex((o: any) => o.id === orderId);

    if (idx === -1) {
      return res.status(404).json({ error: "Order niet gevonden." });
    }

    const oldStatus = orders[idx].status || "Ingediend";
    if (status) {
      orders[idx].status = status;
      orders[idx].history = orders[idx].history || [];
      orders[idx].history.push({
        date: new Date().toISOString(),
        status,
        note: note || `Status gewijzigd van ${oldStatus} naar ${status}.`
      });
    }

    if (assignedStaff !== undefined) {
      orders[idx].assignedStaff = assignedStaff;
      // Add log entry for assignment
      orders[idx].history = orders[idx].history || [];
      orders[idx].history.push({
        date: new Date().toISOString(),
        status: status || orders[idx].status || "Toegewezen",
        note: assignedStaff 
          ? `Order toegewezen aan medewerker: ${assignedStaff}.`
          : `Toewijzing van order ingetrokken.`
      });
    }

    saveOrders(orders);
    res.json({ success: true, order: orders[idx] });
  });

  // API Route: Update file for order (used by customer to resolve preflight warning)
  app.post("/api/orders/:id/update-file", (req, res) => {
    const orderId = req.params.id;
    const { side, imageSrcUrl, fileName, dpi, pixelWidth, pixelHeight } = req.body;
    let orders = loadOrders();
    const idx = orders.findIndex((o: any) => o.id === orderId);
    if (idx === -1) {
      return res.status(404).json({ error: "Order niet gevonden." });
    }

    const orderItem = orders[idx];
    if (side === 'front') {
      orderItem.imageSrcUrl = imageSrcUrl;
      orderItem.frontFileName = fileName;
      orderItem.frontComputedDpi = dpi;
      orderItem.frontPixelWidth = pixelWidth;
      orderItem.frontPixelHeight = pixelHeight;
    } else {
      orderItem.backImageSrcUrl = imageSrcUrl;
      orderItem.backFileName = fileName;
      orderItem.backComputedDpi = dpi;
      orderItem.backPixelWidth = pixelWidth;
      orderItem.backPixelHeight = pixelHeight;
    }

    orderItem.status = "Bestanden Gewijzigd";
    orderItem.history = orderItem.history || [];
    orderItem.history.push({
      date: new Date().toISOString(),
      status: "Bestanden Gewijzigd",
      note: `Klant heeft nieuwe bestanden geüpload voor de ${side === 'front' ? 'Voorkant (A-zijde)' : 'Achterkant (B-zijde)'} (${fileName}).`
    });

    saveOrders(orders);
    res.json({ success: true, order: orderItem });
  });

  // API Route: Delete a validated order
  app.delete("/api/orders/:id", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "FD2026") {
      return res.status(401).json({ error: "Ongeautoriseerd. Wachtwoord is onjuist." });
    }
    const orderId = req.params.id;
    let orders = loadOrders();
    orders = orders.filter((o: any) => o.id !== orderId);
    saveOrders(orders);
    res.json({ success: true });
  });

  // Integrate Vite for dynamic developer server execution
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack] Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
