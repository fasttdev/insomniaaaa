/*
  Insomnia Dev — Web to APK (Official API)
  Endpoint: https://rfweb2apk.rfdevv.com/api/apk/build-api
  Env: RFWEB2APK_API_KEY
*/

const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");

const BASE_URL = "https://rfweb2apk.rfdevv.com";
const API_KEY = process.env.RFWEB2APK_API_KEY || "";

// Setup multer untuk handle multipart/form-data (max 2MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

/* =========================================================
   RATE LIMIT (Server-side guard)
   ========================================================= */
const rateStore = new Map();

function checkRate(ip) {
    const now = Date.now();
    const entry = rateStore.get(ip) || { count: 0, reset: now + 300000 };
    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + 300000;
    }
    entry.count++;
    rateStore.set(ip, entry);
    return entry.count <= 3;
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

    if (!API_KEY) {
        console.error("[WEB2APK] RFWEB2APK_API_KEY tidak diset.");
        return sendJson(res, 500, { ok: false, error: "Server belum dikonfigurasi. Hubungi admin." });
    }

    // Bungkus dengan middleware multer untuk baca file & text fields
    upload.single("icon")(req, res, async function (err) {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return sendJson(res, 400, { ok: false, error: "Ukuran icon maksimal 2MB." });
            }
            return sendJson(res, 400, { ok: false, error: err.message });
        }

        const ip =
            (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
            (req.socket && req.socket.remoteAddress) ||
            "unknown";

        if (!checkRate(ip)) {
            return sendJson(res, 429, { ok: false, error: "Terlalu banyak permintaan. Tunggu 5 menit lagi." });
        }

        // Ambil data dari req.body (otomatis di-parse multer)
        const appName = String(req.body.appName || "").trim();
        const packageName = String(req.body.packageName || "").trim();
        const url = String(req.body.url || "").trim();
        const versionName = String(req.body.versionName || "1.0").trim();
        const versionCode = parseInt(req.body.versionCode, 10) || 1;
        const orientation = String(req.body.orientation || "auto").trim();

        /* Validasi Input */
        if (!appName) return sendJson(res, 400, { ok: false, error: "Nama aplikasi wajib diisi." });
        if (appName.length > 60) return sendJson(res, 400, { ok: false, error: "Nama aplikasi maksimal 60 karakter." });
        if (!packageName) return sendJson(res, 400, { ok: false, error: "Package name wajib diisi." });
        if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
            return sendJson(res, 400, { ok: false, error: "Package name tidak valid. Contoh: com.example.app" });
        }
        if (!url) return sendJson(res, 400, { ok: false, error: "URL wajib diisi." });
        if (!/^https?:\/\//i.test(url)) return sendJson(res, 400, { ok: false, error: "URL harus dimulai dengan http:// atau https://" });

        try {
            const fd = new FormData();
            fd.append("appName", appName);
            fd.append("packageName", packageName);
            fd.append("url", url);
            fd.append("versionName", versionName);
            fd.append("versionCode", String(versionCode));
            fd.append("orientation", orientation);

            // Kalau ada file icon yang diupload
            if (req.file) {
                fd.append("icon", req.file.buffer, {
                    filename: req.file.originalname || "icon.png",
                    contentType: req.file.mimetype,
                });
            }

            const response = await axios.post(`${BASE_URL}/api/apk/build-api`, fd, {
                headers: {
                    ...fd.getHeaders(),
                    "X-API-Key": API_KEY,
                },
                timeout: 120000, // 2 menit
            });

            const data = response.data;

            if (data.success) {
                const sizeMb = (data.size / (1024 * 1024)).toFixed(2);
                return sendJson(res, 200, {
                    ok: true,
                    data: {
                        appName: appName,
                        packageName: packageName,
                        targetUrl: url,
                        fileName: data.fileName,
                        fileSize: data.size,
                        fileSizeFormatted: `${sizeMb} MB`,
                        downloadUrl: data.downloadUrl,
                        buildId: data.buildId
                    }
                });
            } else {
                return sendJson(res, 400, {
                    ok: false,
                    error: data.error || "Gagal membuat APK.",
                    limitReached: !!data.limitReached
                });
            }

        } catch (err) {
            console.error("[WEB2APK ERR]", err.message);

            const errData = err.response && err.response.data;
            if (errData && errData.limitReached) {
                return sendJson(res, 429, {
                    ok: false,
                    error: errData.error || "Limit harian API tercapai.",
                    limitReached: true
                });
            }

            let msg = err.message;
            if (errData && errData.error) msg = errData.error;

            if (err.code === "ECONNABORTED") {
                msg = "Proses build timeout. Server API tidak merespons dalam 2 menit.";
            }

            return sendJson(res, 500, { ok: false, error: msg });
        }
    });
}

module.exports = handler;