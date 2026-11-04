/*
  Insomnia Dev — Express server (thin wrapper)
  - Static file serving
  - Mount /api/download dari folder api/
*/

const express = require("express");
const path = require("path");
const downloadHandler = require("./api/download");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

/* =========================================================
   BLOCK DIRECT ACCESS — jangan biarkan user ambil source
   ========================================================= */
const BLOCKED = ["server.js", "package.json", "package-lock.json", ".env"];

app.use((req, res, next) => {
  const p = req.path.toLowerCase();

  // Jangan sampai /api/download.js ke-serve sebagai static
  if (p.startsWith("/api/") && p.endsWith(".js")) {
    return res.status(403).send("Forbidden");
  }

  if (BLOCKED.some((f) => p.includes(f))) {
    return res.status(403).send("Forbidden");
  }

  next();
});

/* =========================================================
   API ROUTES
   ========================================================= */
app.post("/api/download", downloadHandler);

/* =========================================================
   STATIC FILES
   ========================================================= */
app.use(
  express.static(path.join(__dirname), {
    index: "beranda.html",
    extensions: ["html"],
  })
);

/* =========================================================
   FALLBACK 404
   ========================================================= */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, error: "Endpoint tidak ditemukan." });
  }
  res.status(404).send("Halaman tidak ditemukan.");
});

/* =========================================================
   START
   ========================================================= */
app.listen(PORT, () => {
  console.log(`\n  Insomnia Dev — Server aktif`);
  console.log(`  → http://localhost:${PORT}\n`);
});