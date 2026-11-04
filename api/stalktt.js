/*
  Insomnia Dev — TikTok Stalker (core)
  Source: tikip.us via VamxAPI backend (Vamz Spectre)
  Export: handler(req, res)  → Express & Vercel compatible
*/

const https = require("https");
const { URL } = require("url");

/* =========================================================
   KONFIGURASI
   ========================================================= */
const BACKEND_API_BASE =
  "https://shinyfrydgdghfdgdgmouse-a6de.issam1996kech.workers.dev/api/v1/profile";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT = 15000;

/* =========================================================
   RATE LIMIT
   ========================================================= */
const rateStore = new Map();

function checkRate(ip) {
  var now = Date.now();
  var entry = rateStore.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count++;
  rateStore.set(ip, entry);
  return entry.count <= 10;
}

/* =========================================================
   HTTP REQUEST (IPv4-forced)
   ========================================================= */
function request(urlStr) {
  return new Promise(function (resolve, reject) {
    var parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error("URL tidak valid: " + urlStr));
    }

    var req = https.request(
      parsed,
      {
        method: "GET",
        family: 4,
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://tikip.us",
          Referer: "https://tikip.us/",
        },
        timeout: REQUEST_TIMEOUT,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          var body = Buffer.concat(chunks).toString("utf-8");
          try {
            var json = JSON.parse(body);
            resolve({ status: res.statusCode, data: json, raw: body });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on("error", function (err) {
      reject(new Error("Koneksi ke sumber gagal: " + err.message));
    });

    req.on("timeout", function () {
      req.destroy();
      reject(new Error("Sumber tidak merespons dalam " + (REQUEST_TIMEOUT / 1000) + " detik."));
    });

    req.end();
  });
}

/* =========================================================
   PARSING INPUT
   ========================================================= */
function extractUsername(input) {
  if (!input) return null;
  var s = String(input).trim();
  if (!s) return null;

  var m = s.match(/tiktok\.com\/@([a-zA-Z0-9._-]+)/i);
  if (m && m[1]) return m[1];

  s = s.replace(/^@+/, "").trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) return null;
  return s;
}

/* =========================================================
   CORE
   ========================================================= */
async function fetchProfile(username) {
  var url = BACKEND_API_BASE + "?username=" + encodeURIComponent(username);
  var res = await request(url);

  if (!res.data || typeof res.data !== "object") {
    var snippet = String(res.raw || "").substring(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      "Sumber mengembalikan respons tidak valid (status " + res.status + ")" +
      (snippet ? " — cuplikan: " + snippet : "")
    );
  }

  if (res.data.status === "error") {
    throw new Error(res.data.error || "Akun tidak ditemukan.");
  }

  if (res.data.status !== "success" || !res.data.data || !res.data.data.user) {
    throw new Error(res.data.message || "Data profil tidak lengkap dari sumber.");
  }

  return res.data.data;
}

/* =========================================================
   NORMALISASI — shape seragam untuk frontend
   ========================================================= */
function fixOverflow(n) {
  var v = Number(n);
  if (!isFinite(v)) return 0;
  if (v < 0) return v >>> 0;
  return v;
}

function flagEmoji(code) {
  if (!code || typeof code !== "string" || code.length !== 2) return "";
  try {
    var cps = code
      .toUpperCase()
      .split("")
      .map(function (c) { return 127397 + c.charCodeAt(0); });
    return String.fromCodePoint.apply(null, cps);
  } catch (e) {
    return "";
  }
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;

  var user = raw.user || {};
  var stats = raw.stats || {};
  var region = raw.region || {};
  var avatar = raw.avatar || {};

  var curr = region.current_region || {};
  var reg  = region.registered_region || {};
  var lock = region.locked_region || {};

  return {
    id: user.id || "",
    secUid: user.sec_uid || "",
    username: user.username || "",
    nickname: user.nickname || "",
    bio: user.bio || "",
    bioLink: user.bio_link || "",
    profileUrl: user.profile_url || (user.username ? "https://www.tiktok.com/@" + user.username : ""),

    verified: !!user.verified,
    privateAccount: !!user.private,

    language: user.language || "",
    createdAt: user.created_at || "",
    createdTimestamp: user.created_timestamp || null,

    avatar: avatar.hd || avatar.medium || avatar.thumb || "",

    regionCode: region.code || "",
    regionCountry: region.country || "",
    regionFlag: region.flag || flagEmoji(region.code),

    currentRegionCode: curr.code || "",
    currentRegionCountry: curr.country || "",
    currentRegionFlag: curr.flag || flagEmoji(curr.code),

    registeredRegionCode: reg.code || "",
    registeredRegionCountry: reg.country || "",
    registeredRegionFlag: reg.flag || flagEmoji(reg.code),

    lockedRegionCode: lock.code || "",
    lockedRegionCountry: lock.country || "",
    lockedRegionFlag: lock.flag || flagEmoji(lock.code),

    followers: fixOverflow(stats.followers),
    following: fixOverflow(stats.following),
    likes: fixOverflow(stats.likes),
    videos: fixOverflow(stats.videos),
    friends: fixOverflow(stats.friends),
  };
}

/* =========================================================
   HTTP HANDLER
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

  var ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";

  if (!checkRate(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: "Terlalu banyak permintaan. Coba lagi sebentar.",
    });
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  var input = body && typeof body.input === "string" ? body.input.trim() : "";

  if (!input) {
    return sendJson(res, 400, {
      ok: false,
      error: "Username atau URL TikTok wajib diisi.",
    });
  }
  if (input.length > 512) {
    return sendJson(res, 400, { ok: false, error: "Input terlalu panjang." });
  }

  var username = extractUsername(input);
  if (!username) {
    return sendJson(res, 400, {
      ok: false,
      error: "Format tidak valid. Contoh: @username atau tiktok.com/@username",
    });
  }

  var started = Date.now();
  try {
    var rawData = await fetchProfile(username);
    var profile = normalize(rawData);

    console.log("[STALK OK] @" + username + " (" + (Date.now() - started) + "ms)");

    return sendJson(res, 200, {
      ok: true,
      username: username,
      profile: profile,
      raw: rawData,
    });
  } catch (err) {
    console.error("[STALK ERR] @" + username + ": " + err.message);
    return sendJson(res, 500, {
      ok: false,
      error: err.message || "Gagal mengambil profil.",
    });
  }
}

module.exports = handler;
module.exports.fetchProfile = fetchProfile;
module.exports.normalize = normalize;
module.exports.extractUsername = extractUsername;