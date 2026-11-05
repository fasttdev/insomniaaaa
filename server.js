/*
  Insomnia Dev — Express server (thin wrapper)
*/

const express = require("express");
const path = require("path");
const downloadHandler     = require("./api/download");
const stalkttHandler      = require("./api/stalktt");
const reqHandler          = require("./api/req");
const wainspectorHandler  = require("./api/wainspector");
const webtoapkHandler     = require("./api/webtoapk");
const bypassHandler       = require("./api/bypass");
const vtsearchHandler     = require("./api/vtsearch");
const pinterestHandler    = require("./api/pinterest");
const texttoimageHandler  = require("./api/texttoimage");
const playstoreHandler    = require("./api/playstore");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

/* =========================================================
   BLOCK DIRECT ACCESS
   ========================================================= */
const BLOCKED = ["server.js", "package.json", "package-lock.json", ".env", ".rfweb2apk_token.json"];

app.use((req, res, next) => {
  const p = req.path.toLowerCase();

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
app.post("/api/download",     downloadHandler);
app.post("/api/stalktt",      stalkttHandler);
app.post("/api/req",          reqHandler);
app.post("/api/wainspector",  wainspectorHandler);
app.post("/api/webtoapk",     webtoapkHandler);
app.post("/api/bypass",       bypassHandler);
app.post("/api/vtsearch",     vtsearchHandler);
app.post("/api/pinterest",    pinterestHandler);
app.post("/api/texttoimage",  texttoimageHandler);
app.post("/api/playstore",    playstoreHandler);

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