/*
  Insomnia Dev — WA Inspector
  Berdasarkan logika Vamz Spectre (vamxapi.my.id)
  Export: handler(req, res)
*/

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
  return entry.count <= 20;
}

/* =========================================================
   LOGIKA
   ========================================================= */
const SAMPLE_BIOS = [
  "Available",
  "Busy",
  "At work",
  "Battery low, text only",
  "Urgent calls only",
  "Hey there! I am using WhatsApp.",
  "Sleeping",
  "In a meeting",
  "Living my life ✨",
  "Alhamdulillah 🙏",
  "Working on big dreams...",
  "Fast Response 💬",
];

function formatPhoneNumber(rawNumber, defaultCountry) {
  defaultCountry = defaultCountry || "62";
  var cleaned = String(rawNumber).replace(/[^\d+]/g, "");
  if (!cleaned) return { valid: false, number: rawNumber };

  if (cleaned.charAt(0) === "+") cleaned = cleaned.substring(1);
  else if (cleaned.indexOf("00") === 0) cleaned = cleaned.substring(2);
  else if (cleaned.charAt(0) === "0" && defaultCountry !== "other")
    cleaned = defaultCountry + cleaned.substring(1);
  else if (cleaned.indexOf(defaultCountry) !== 0 && defaultCountry !== "other") {
    if (cleaned.length <= 12 && cleaned.indexOf("62") !== 0)
      cleaned = defaultCountry + cleaned;
  }

  if (cleaned.length < 8 || cleaned.length > 15)
    return { valid: false, number: rawNumber };
  return { valid: true, number: "+" + cleaned };
}

function checkIsMewah(numberStr) {
  var tail = String(numberStr).replace(/\+/g, "").slice(-6);
  if (/(\d)\1{3,}/.test(tail)) return true;
  if (/0123|1234|2345|3456|4567|5678|6789|9876|8765|7654/.test(tail)) return true;
  if (/(\d\d)\1{2,}/.test(tail)) return true;
  return false;
}

function checkIsOldNumber(numberStr) {
  var cleanNum = String(numberStr).replace(/\+/g, "");
  if (
    cleanNum.indexOf("62") === 0 &&
    ["811", "812", "813", "816", "817", "818", "852", "838"].indexOf(
      cleanNum.substring(2, 5)
    ) !== -1
  ) {
    return true;
  }
  return cleanNum.length <= 11;
}

function generateOtpSmsStatus() {
  var rand = Math.random();
  if (rand < 0.35) {
    return { status: "ready", text: "Bisa Request SMS Sekarang", category: "ready" };
  } else if (rand < 0.75) {
    var mins = Math.floor(Math.random() * 55) + 2;
    return {
      status: "cooldown",
      text: "Tunggu " + mins + " Menit Lagi",
      category: "minutes",
    };
  } else {
    var hours = (Math.random() * 23 + 1).toFixed(1);
    return {
      status: "cooldown",
      text: "Tunggu " + hours + " Jam Lagi",
      category: "hours",
    };
  }
}

function inspectWaNumber(input, options) {
  options = options || {};
  var mode = options.mode || "wa";
  var defaultCountry = options.defaultCountry || "62";

  var numbers = Array.isArray(input)
    ? input
    : String(input)
        .split(/[\n,;]+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);

  if (numbers.length === 0) {
    return { status: false, message: "Masukkan nomor telepon yang valid." };
  }

  var results = numbers.map(function (raw, idx) {
    var formattedObj = formatPhoneNumber(raw, defaultCountry);

    if (!formattedObj.valid) {
      return {
        id: idx + 1,
        raw: raw,
        formatted: raw,
        isValid: false,
        status: "invalid",
        bio: "Format nomor salah",
        umur: "-",
        otp: "Format Invalid",
        kategori: ["Format Invalid"],
      };
    }

    var formattedNum = formattedObj.number;
    var cleanNum = formattedNum.replace(/\+/g, "");

    if (mode === "otp_sms") {
      var smsResult = generateOtpSmsStatus();
      return {
        id: idx + 1,
        raw: raw,
        formatted: formattedNum,
        isValid: true,
        status: smsResult.status,
        otp: smsResult.text,
        kategori: [
          smsResult.category === "ready"
            ? "Ready SMS"
            : smsResult.category === "minutes"
            ? "Jeda Menit"
            : "Jeda Jam",
        ],
        umur: "-",
        bio: "-",
      };
    }

    var isMewah = checkIsMewah(formattedNum);
    var isOld = checkIsOldNumber(formattedNum);
    var kategori = [];
    if (isMewah) kategori.push("Mewah");
    if (isOld) kategori.push("Old");
    if (kategori.length === 0) kategori.push("Regular");

    var umur =
      (isOld
        ? (Math.random() * 7 + 5).toFixed(1)
        : (Math.random() * 3.5 + 0.5).toFixed(1)) + " Thn";
    var isReg = Math.random() > 0.25;

    return {
      id: idx + 1,
      raw: raw,
      formatted: formattedNum,
      isValid: true,
      status: isReg ? "registered" : "unregistered",
      bio: isReg
        ? SAMPLE_BIOS[Math.floor(Math.random() * SAMPLE_BIOS.length)]
        : "Akun tidak terdaftar",
      umur: umur,
      otp: isReg ? (Math.random() > 0.15 ? "Bisa Masuk" : "Tidak (Blocked)") : "Tidak Masuk",
      kategori: kategori,
      waLink: isReg ? "https://wa.me/" + cleanNum : null,
    };
  });

  return {
    status: true,
    total: results.length,
    mode: mode,
    data: results.length === 1 ? results[0] : results,
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

  var number = body && typeof body.number === "string" ? body.number.trim() : "";
  var mode = body && typeof body.mode === "string" ? body.mode : "wa";

  if (!number) {
    return sendJson(res, 400, { ok: false, error: "Nomor wajib diisi." });
  }
  if (number.length > 5000) {
    return sendJson(res, 400, { ok: false, error: "Input terlalu panjang." });
  }
  if (mode !== "wa" && mode !== "otp_sms") {
    return sendJson(res, 400, { ok: false, error: "Mode tidak valid." });
  }

  try {
    var result = inspectWaNumber(number, { mode: mode });
    if (!result.status) {
      return sendJson(res, 400, { ok: false, error: result.message });
    }
    return sendJson(res, 200, { ok: true, data: result });
  } catch (err) {
    console.error("[WA INSPECT ERR] " + err.message);
    return sendJson(res, 500, { ok: false, error: "Gagal memproses nomor." });
  }
}

module.exports = handler;