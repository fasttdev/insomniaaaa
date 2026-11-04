/*
  Insomnia Dev — All-in-One Downloader (core)
  Export: async handler(req, res)  → portable ke Express & Vercel
          handler.fetchDownload(url)
*/

const axios = require("axios");
const CryptoJS = require("crypto-js");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

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
   CORE
   ========================================================= */
async function fetchDownload(targetUrl) {
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
    params: { url: `${CONFIG.baseUrl}/in/`, sitekey: CONFIG.siteKey },
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

  const sccMatch = pageRes.data.match(
    /id=["']scc["'][^>]*value=["']([^"']+)["']/i
  );
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

  // 3. Encrypt URL — AES-256-CBC + IV tetap
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

  const res = await client.post(
    `${CONFIG.baseUrl}${endpointPath}`,
    form.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: CONFIG.baseUrl,
        Referer: `${CONFIG.baseUrl}/in/`,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: CONFIG.requestTimeout,
    }
  );

  return res.data;
}

/* =========================================================
   HTTP HANDLER (Express + Vercel compatible)
   ========================================================= */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";

  if (!checkRate(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: "Terlalu banyak permintaan. Coba lagi sebentar.",
    });
  }

  // Body bisa berupa object (Express/Vercel parse) atau string mentah
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const url = body && typeof body.url === "string" ? body.url.trim() : "";

  if (!url) {
    return sendJson(res, 400, { ok: false, error: "URL wajib diisi." });
  }
  if (!/^https?:\/\//i.test(url)) {
    return sendJson(res, 400, {
      ok: false,
      error: "URL harus dimulai dengan http:// atau https://",
    });
  }
  if (url.length > 2048) {
    return sendJson(res, 400, { ok: false, error: "URL terlalu panjang." });
  }

  const started = Date.now();
  try {
    const data = await fetchDownload(url);
    console.log(`[OK] ${url} (${Date.now() - started}ms)`);
    return sendJson(res, 200, { ok: true, data });
  } catch (err) {
    console.error(`[ERR] ${url}: ${err.message}`);
    return sendJson(res, 500, {
      ok: false,
      error: err.message || "Gagal memproses link.",
    });
  }
}

module.exports = handler;
module.exports.fetchDownload = fetchDownload;