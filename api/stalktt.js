/*
  Insomnia Dev — TikTok Stalker (core)
  Source: tokviewer.net
  Export: handler(req, res)  → Express & Vercel compatible
          handler.fetchProfile(username)
          handler.normalize(raw)
*/

const https = require("https");

/* =========================================================
   KONFIGURASI
   ========================================================= */
const API_HOST = "tokviewer.net";
const API_PATH = "/api/tiktok/get-profile";
const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

/* =========================================================
   RATE LIMIT (per IP, 8 req/menit)
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
  return entry.count <= 8;
}

/* =========================================================
   HTTP REQUEST KE TOKVIEWER
   ========================================================= */
function postJson(payload) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify(payload);

    var options = {
      method: "POST",
      hostname: API_HOST,
      path: API_PATH,
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Origin: "https://" + API_HOST,
        Referer: "https://" + API_HOST + "/id",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      timeout: 30000,
    };

    var req = https.request(options, function (res) {
      var data = "";
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        data += chunk;
      });
      res.on("end", function () {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Respons dari sumber tidak valid."));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", function () {
      req.destroy(new Error("Sumber tidak merespons. Coba lagi."));
    });

    req.write(postData);
    req.end();
  });
}

/* =========================================================
   PARSING USERNAME
   ========================================================= */
function extractUsername(input) {
  if (!input) return null;
  var s = String(input).trim();
  if (!s) return null;

  // URL tiktok.com/@username
  var m = s.match(/tiktok\.com\/@([a-zA-Z0-9._-]+)/i);
  if (m && m[1]) return m[1];

  // @username atau username
  s = s.replace(/^@+/, "").trim();

  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) return null;
  return s;
}

/* =========================================================
   NORMALISASI — handle berbagai bentuk respons
   ========================================================= */
function pick(obj, paths) {
  if (!obj) return null;
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    var parts = path.split(".");
    var val = obj;
    var ok = true;
    for (var j = 0; j < parts.length; j++) {
      if (val == null) {
        ok = false;
        break;
      }
      val = val[parts[j]];
    }
    if (ok && val != null && val !== "") return val;
  }
  return null;
}

function toNum(v) {
  if (v == null) return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;

  var data = raw.data && typeof raw.data === "object" ? raw.data : raw;

  var user = data.user || data.userInfo || data.author || data;
  var stats = data.stats || user.stats || data.statistics || user.statistics || {};

  return {
    username: String(
      pick(user, ["uniqueId", "unique_id", "username", "handle"]) ||
        pick(data, ["uniqueId", "unique_id", "username"]) ||
        ""
    ),
    nickname: String(
      pick(user, ["nickname", "nickName", "name", "displayName"]) || ""
    ),
    bio: String(
      pick(user, ["signature", "bio", "desc", "description"]) || ""
    ),
    avatar: String(
      pick(user, [
        "avatarLarger",
        "avatar_larger",
        "avatarMedium",
        "avatar_medium",
        "avatarThumb",
        "avatar",
        "avatar_url",
        "avatarUrl",
      ]) || ""
    ),
    verified: !!pick(user, ["verified", "isVerified", "is_verified"]),
    privateAccount: !!pick(user, [
      "privateAccount",
      "isPrivate",
      "is_private",
    ]),
    region: String(pick(user, ["region", "country", "countryCode"]) || ""),
    followers: toNum(
      pick(stats, [
        "followerCount",
        "followers",
        "follower_count",
        "followerCountFormatted",
      ])
    ),
    following: toNum(
      pick(stats, [
        "followingCount",
        "following",
        "following_count",
        "followingCountFormatted",
      ])
    ),
    likes: toNum(
      pick(stats, ["heartCount", "heart", "likes", "like_count", "likesCount"])
    ),
    videos: toNum(
      pick(stats, ["videoCount", "video", "videos", "video_count", "videoCount"])
    ),
  };
}

/* =========================================================
   CORE
   ========================================================= */
async function fetchProfile(username) {
  var parsed = await postJson({ unique_id: username });

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Respons kosong dari sumber.");
  }

  if (parsed.code !== undefined && parsed.code !== 0 && parsed.code !== 200) {
    throw new Error(parsed.msg || parsed.message || "Gagal mengambil profil.");
  }

  return parsed.data || parsed.result || parsed;
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
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  var input =
    body && typeof body.input === "string" ? body.input.trim() : "";

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

    console.log(
      "[STALK OK] @" + username + " (" + (Date.now() - started) + "ms)"
    );

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