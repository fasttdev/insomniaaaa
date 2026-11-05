/*
  Insomnia Dev — Request Tools / Menu
  Kirim ke Telegram via Bot API
  Env vars yang dibutuhkan:
    - TELEGRAM_BOT_TOKEN
    - TELEGRAM_CHAT_ID
  Export: handler(req, res)  → Express & Vercel compatible
*/

/* =========================================================
   KONFIGURASI
   ========================================================= */
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID || "";
const REQ_TIMEOUT = 15000;

/* =========================================================
   RATE LIMIT — 3 request / 10 menit / IP
   + dedup: input sama dari IP sama dalam 5 menit ditolak
   ========================================================= */
const rateStore = new Map();
const dedupStore = new Map();

function checkRate(ip) {
  var now = Date.now();
  var entry = rateStore.get(ip) || { count: 0, reset: now + 600000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 600000;
  }
  entry.count++;
  rateStore.set(ip, entry);
  return entry.count <= 3;
}

function checkDedup(ip, hash) {
  var now = Date.now();
  var key = ip + "|" + hash;
  var last = dedupStore.get(key);
  if (last && now - last < 300000) return false; // masih dalam 5 menit
  dedupStore.set(key, now);
  return true;
}

function simpleHash(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

/* =========================================================
   HELPER
   ========================================================= */
function escapeTelegramHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wibTime() {
  var now = new Date();
  var wib = new Date(now.getTime() + 7 * 3600 * 1000);
  var pad = function (n) { return n < 10 ? "0" + n : String(n); };
  return (
    wib.getUTCFullYear() + "-" +
    pad(wib.getUTCMonth() + 1) + "-" +
    pad(wib.getUTCDate()) + " " +
    pad(wib.getUTCHours()) + ":" +
    pad(wib.getUTCMinutes())
  );
}

/* =========================================================
   TELEGRAM SEND
   ========================================================= */
async function sendTelegram(text) {
  var url = "https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage";

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, REQ_TIMEOUT);

  try {
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    var data = await res.json().catch(function () { return null; });

    if (!data || data.ok !== true) {
      throw new Error(
        (data && data.description) || "Telegram menolak pesan."
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
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

  /* Cek konfigurasi server */
  if (!TG_TOKEN || !TG_CHAT) {
    return sendJson(res, 500, {
      ok: false,
      error: "Server belum dikonfigurasi. Hubungi admin.",
    });
  }

  var ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";

  if (!checkRate(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: "Terlalu banyak request. Coba lagi 10 menit lagi.",
    });
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  var name = body && typeof body.name === "string" ? body.name.trim() : "";
  var type = body && typeof body.type === "string" ? body.type.trim() : "";
  var text = body && typeof body.text === "string" ? body.text.trim() : "";

  /* Validasi */
  if (!name) {
    return sendJson(res, 400, { ok: false, error: "Nama wajib diisi." });
  }
  if (name.length < 2) {
    return sendJson(res, 400, { ok: false, error: "Nama minimal 2 karakter." });
  }
  if (name.length > 50) {
    return sendJson(res, 400, { ok: false, error: "Nama maksimal 50 karakter." });
  }

  if (type !== "Tools" && type !== "Menu") {
    return sendJson(res, 400, {
      ok: false,
      error: "Jenis request tidak valid.",
    });
  }

  if (!text) {
    return sendJson(res, 400, { ok: false, error: "Request wajib diisi." });
  }
  if (text.length < 10) {
    return sendJson(res, 400, {
      ok: false,
      error: "Request minimal 10 karakter.",
    });
  }
  if (text.length > 1000) {
    return sendJson(res, 400, {
      ok: false,
      error: "Request maksimal 1000 karakter.",
    });
  }

  /* Anti-spam dedup */
  if (!checkDedup(ip, simpleHash(name + "|" + type + "|" + text))) {
    return sendJson(res, 429, {
      ok: false,
      error: "Request serupa baru saja dikirim. Tunggu beberapa menit.",
    });
  }

  /* Bangun pesan */
  var time = wibTime();

  var message =
    "🔔 <b>Request Baru</b>\n" +
    "━━━━━━━━━━━━━━━━━\n\n" +
    "👤 <b>Nama:</b> " + escapeTelegramHtml(name) + "\n" +
    "📂 <b>Jenis:</b> " + escapeTelegramHtml(type) + "\n\n" +
    "💬 <b>Request:</b>\n" +
    escapeTelegramHtml(text) + "\n\n" +
    "━━━━━━━━━━━━━━━━━\n" +
    "🌐 IP: <code>" + escapeTelegramHtml(ip) + "</code>\n" +
    "🕒 " + time + " WIB";

  var started = Date.now();
  try {
    await sendTelegram(message);
    console.log(
      "[REQ OK] " + type + " dari " + name + " (" + (Date.now() - started) + "ms)"
    );
    return sendJson(res, 200, {
      ok: true,
      message: "Request kamu sudah terkirim. Terima kasih!",
    });
  } catch (err) {
    console.error("[REQ ERR] " + err.message);
    return sendJson(res, 500, {
      ok: false,
      error: "Gagal mengirim request. Coba lagi nanti.",
    });
  }
}

module.exports = handler;