/*
  Insomnia Dev — TikTok Stalker (core)
  Source: tikip.us via VamxAPI backend
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
   HELPER
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

function asStr(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.code) return String(v.code);
  return String(v);
}

/* =========================================================
   NORMALISASI — sesuai shape RAW dari backend worker:
   {
     user: { uniqueId, nickname, signature, avatarLarger, ... },
     stats: { followerCount, followingCount, heartCount, ... },
     region: "ID", region_name: "Indonesia",
     current_region, current_region_name,
     registered_region, registered_region_name,
     locked_region, locked_region_name
   }
   ========================================================= */
function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;

  var user  = raw.user  || {};
  var stats = raw.stats || {};

  /* Region — top-level string (fallback ke user.current_region) */
  var regionCode = asStr(raw.region || user.current_region || "");
  var regionName = asStr(raw.region_name || user.current_region_name || "");

  var currentCode = asStr(raw.current_region || user.current_region || "");
  var currentName = asStr(raw.current_region_name || user.current_region_name || "");

  var regCode = asStr(raw.registered_region || user.registered_region || "");
  var regName = asStr(raw.registered_region_name || user.registered_region_name || "");

  var lockCode = asStr(raw.locked_region || user.locked_region || "");
  var lockName = asStr(raw.locked_region_name || user.locked_region_name || "");

  /* Bio link — bisa null, string, atau object */
  var bioLink = "";
  if (user.bioLink) {
    if (typeof user.bioLink === "string") bioLink = user.bioLink;
    else if (user.bioLink.link) bioLink = String(user.bioLink.link);
  }

  /* createdAt dari createTime (Unix seconds) */
  var createdAt = "";
  if (user.createTime) {
    try {
      createdAt = new Date(Number(user.createTime) * 1000).toISOString();
    } catch (e) {}
  }

  /* Avatar priority */
  var avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || "";

  return {
    id: asStr(user.id),
    secUid: asStr(user.secUid),
    username: asStr(user.uniqueId),
    nickname: asStr(user.nickname),
    bio: asStr(user.signature),
    bioLink: bioLink,
    profileUrl: user.uniqueId
      ? "https://www.tiktok.com/@" + encodeURIComponent(user.uniqueId)
      : "",

    verified: !!user.verified,
    privateAccount: !!user.privateAccount,
    language: asStr(user.language),
    createdAt: createdAt,
    createdTimestamp: user.createTime || null,

    avatar: avatar,

    regionCode: regionCode,
    regionCountry: regionName,
    regionFlag: flagEmoji(regionCode),

    currentRegionCode: currentCode,
    currentRegionCountry: currentName,
    currentRegionFlag: flagEmoji(currentCode),

    registeredRegionCode: regCode,
    registeredRegionCountry: regName,
    registeredRegionFlag: flagEmoji(regCode),

    lockedRegionCode: lockCode,
    lockedRegionCountry: lockName,
    lockedRegionFlag: flagEmoji(lockCode),

    followers: fixOverflow(stats.followerCount),
    following: fixOverflow(stats.followingCount),
    likes: fixOverflow(stats.heartCount),
    videos: fixOverflow(stats.videoCount),
    friends: fixOverflow(stats.friendCount),
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