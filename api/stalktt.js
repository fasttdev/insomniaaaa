/*
  Insomnia Dev — TikTok Stalker (core)
  Source: tokviewer.net
  Export: handler(req, res)  → Express & Vercel compatible
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
  return entry.count <= 8;
}

/* =========================================================
   HTTP
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
   HELPER NORMALISASI
   ========================================================= */
function pick(obj, paths) {
  if (!obj) return null;
  for (var i = 0; i < paths.length; i++) {
    var parts = paths[i].split(".");
    var val = obj;
    var ok = true;
    for (var j = 0; j < parts.length; j++) {
      if (val == null || typeof val !== "object") {
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

function toStr(v) {
  if (v == null) return "";
  return String(v);
}

function toBool(v) {
  if (v === true || v === "true" || v === 1) return true;
  return false;
}

/* =========================================================
   NORMALISASI — cocok dengan shape tokviewer.net
   Support juga kalau bentukannya beda (nested data/user/stats)
   ========================================================= */
function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;

  // sumber utama
  var src = raw;
  if (raw.result && typeof raw.result === "object") src = raw.result;
  else if (raw.data && typeof raw.data === "object") src = raw.data;

  // kalau ada nested lebih dalam lagi
  if (src.result && typeof src.result === "object" && !src.username && !src.uniqueId) {
    src = src.result;
  }

  var badges = src.badges || {};
  var analytics = src.analytics || {};
  var er = analytics.engagement_rate || {};

  return {
    username: toStr(pick(src, ["username", "uniqueId", "unique_id"])),
    nickname: toStr(pick(src, ["nickname", "nickName", "name", "displayName"])),
    id: toStr(pick(src, ["id", "userId", "uid"])),
    bio: toStr(pick(src, ["bio", "signature", "desc", "description"])),

    avatar: toStr(
      pick(src, [
        "avatar_url",
        "downloads.avatar_hd",
        "downloads.avatar_cdn",
        "avatarLarger",
        "avatarUrl",
        "avatar",
      ])
    ),

    profileUrl: toStr(pick(src, ["profile_url", "profileUrl"])),

    verified: toBool(pick(src, ["verified", "badges.verified", "isVerified"])),
    privateAccount: toBool(
      pick(src, ["is_private", "badges.is_private", "privateAccount", "isPrivate"])
    ),
    region: toStr(pick(src, ["region", "country", "countryCode"])),

    followers: toNum(pick(src, ["followers", "followerCount", "follower_count"])),
    followersFormatted: toStr(pick(src, ["followers_formatted"])),

    following: toNum(pick(src, ["following", "followingCount", "following_count"])),
    followingFormatted: toStr(pick(src, ["following_formatted"])),

    likes: toNum(pick(src, ["likes", "heartCount", "like_count"])),
    likesFormatted: toStr(pick(src, ["likes_formatted"])),

    videos: toNum(pick(src, ["video_count", "videoCount", "video"])),

    accountAge: toStr(pick(src, ["account_age", "badges.account_age"])),
    createdAt: toStr(pick(src, ["created_at", "badges.created_at"])),

    avgLikes: toNum(pick(src, ["average_likes_per_video"])),
    avgLikesFormatted: toStr(pick(src, ["average_likes_formatted"])),

    engagementRate: toStr(pick(er, ["rate", "formatted"])),
    engagementPercent: toNum(pick(er, ["percentage"])),
    engagementGrade: toStr(pick(er, ["grade"])),

    activityScore: toNum(pick(analytics, ["activity_score"])),

    reachMin: toStr(pick(analytics, ["estimated_reach.min_formatted"])),
    reachMax: toStr(pick(analytics, ["estimated_reach.max_formatted"])),
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

  if (parsed.status === false) {
    throw new Error(parsed.message || parsed.msg || "Gagal mengambil profil.");
  }
  if (parsed.code !== undefined && parsed.code !== 0 && parsed.code !== 200) {
    throw new Error(parsed.message || parsed.msg || "Gagal mengambil profil.");
  }

  return parsed.result || parsed.data || parsed;
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