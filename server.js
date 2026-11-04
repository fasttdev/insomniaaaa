/*
  Insomnia Dev — Backend All-in-One Downloader
  Base logic: allinonedownloader.com via Turnstile solver
  Endpoint: POST /api/download { url } → { ok, data } | { ok:false, error }
*/

const express = require("express");
const path = require("path");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

/* =========================================================
   KONFIGURASI
   ========================================================= */
const CONFIG = {
  baseUrl: "https://allinonedownloader.com",
  solverApi: "https://api.ikyyxd.my.id/bypass/turnstile-cf-min",
  siteKey: "0x4AAAAAACm5JpnQ9wkl8EIR",
  userAgent:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  requestTimeout: 90000,
};

const AES_IV_HEX = "afc4e290725a3bf0ac4d3ff826c43c10";

/* =========================================================
   RATE LIMIT (per IP, 8 req/menit)
   ========================================================= */
const rateStore = new Map();

function checkRate(ip) {
  const now = Date.now();
  const entry = rateStore.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count++;
  rateStore.set(ip, entry);
  return entry.count <= 8;
}

/* =========================================================
   CORE DOWNLOAD
   ========================================================= */
async function fetchDownload(targetUrl) {
  // fresh jar per request — jangan sampai cookie nyampur antar user
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      headers: {
        "User-Agent": CONFIG.userAgent,
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    })
  );

  // 1. Solve Turnstile
  const solverRes = await axios.get(CONFIG.solverApi, {
    params: {
      url: `${CONFIG.baseUrl}/in/`,
      sitekey: CONFIG.siteKey,
    },
    timeout: CONFIG.requestTimeout,
  });

  if (!solverRes.data?.status || !solverRes.data?.result?.token) {
    throw new Error("Solver Turnstile gagal mengembalikan token.");
  }
  const ttoken = solverRes.data.result.token;

  // 2. Ambil halaman → scc (endpoint dinamis) + token
  const pageRes = await client.get(`${CONFIG.baseUrl}/in/`, {
    headers: { Referer: CONFIG.baseUrl },
    timeout: CONFIG.requestTimeout,
  });

  const sccMatch = pageRes.data.match(/id=["']scc["'][^>]*value=["']([^"']+)["']/i);
  if (!sccMatch || !sccMatch[1]) {
    throw new Error("Endpoint dinamis (#scc) tidak ditemukan di halaman.");
  }
  const endpointPath = sccMatch[1];

  const tokenMatch = pageRes.data.match(
    /id=["']token["'][^>]*value=["']([^"']+)["']/i
  );
  if (!tokenMatch || !tokenMatch[1]) {
    throw new Error("Token halaman (#token) tidak ditemukan.");
  }
  const pageToken = tokenMatch[1];

  // 3. Encrypt URL pakai AES-256-CBC + IV tetap
  let urlHash;
  try {
    const key = CryptoJS.enc.Hex.parse(pageToken);
    const iv = CryptoJS.enc.Hex.parse(AES_IV_HEX);
    urlHash = CryptoJS.AES.encrypt(targetUrl, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.ZeroPadding,
    }).toString();
  } catch (err) {
    throw new Error("Enkripsi URL gagal: " + err.message);
  }

  // 4. POST form ke endpoint
  const form = new URLSearchParams();
  form.append("url", targetUrl);
  form.append("token", pageToken);
  form.append("urlhash", urlHash);
  form.append("ttoken", ttoken);

  const res = await client.post(`${CONFIG.baseUrl}${endpointPath}`, form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: CONFIG.baseUrl,
      Referer: `${CONFIG.baseUrl}/in/`,
      "X-Requested-With": "XMLHttpRequest",
    },
    timeout: CONFIG.requestTimeout,
  });

  return res.data;
}

/* =========================================================
   API ENDPOINT
   ========================================================= */
app.post("/api/download", async (req, res) => {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  if (!checkRate(ip)) {
    return res
      .status(429)
      .json({ ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar." });
  }

  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ ok: false, error: "URL wajib diisi." });
  }

  const trimmed = url.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return res
      .status(400)
      .json({ ok: false, error: "URL harus dimulai dengan http:// atau https://" });
  }

  if (trimmed.length > 2048) {
    return res.status(400).json({ ok: false, error: "URL terlalu panjang." });
  }

  const started = Date.now();

  try {
    const data = await fetchDownload(trimmed);
    console.log(`[OK] ${trimmed} (${Date.now() - started}ms)`);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(`[ERR] ${trimmed}: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: err.message || "Gagal memproses link.",
    });
  }
});

/* =========================================================
   STATIC FILES
   ========================================================= */
const BLOCKED = ["server.js", "package.json", "package-lock.json", ".env"];

app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED.some((f) => p.includes(f))) {
    return res.status(403).send("Forbidden");
  }
  next();
});

app.use(
  express.static(path.join(__dirname), {
    index: "beranda.html",
    extensions: ["html"],
  })
);

/* Fallback 404 */
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