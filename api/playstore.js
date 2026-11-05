/**
 * Google Play Store Scraper
 * Creator: IzzXd
 * Base: https://play.google.com
 */

const gplayModule = require('google-play-scraper');
const gplay = gplayModule.default || gplayModule;

/* =========================================================
   RATE LIMIT (10 req/menit)
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
    return entry.count <= 10;
}

/* =========================================================
   HELPER
   ========================================================= */
function formatApp(app) {
    if (!app) return null;
    const appId = app.appId || '';

    return {
        title: app.title || '',
        appId: appId,
        url: app.url || `https://play.google.com/store/apps/details?id=${appId}`,
        links: {
            playStore: `https://play.google.com/store/apps/details?id=${appId}`,
            market: `market://details?id=${appId}`,
            apkCombo: `https://apkcombo.com/app/${appId}/download/apk`,
            apkPure: `https://apkpure.com/p/${appId}`
        },
        developer: {
            name: app.developer || '',
            id: app.developerId || '',
            email: app.developerEmail || null,
            website: app.developerWebsite || null,
            address: app.developerAddress || null
        },
        score: app.score || 0,
        scoreText: app.scoreText || String(app.score || '0'),
        ratings: app.ratings || 0,
        reviews: app.reviews || 0,
        installs: app.installs || '0+',
        minInstalls: app.minInstalls || 0,
        maxInstalls: app.maxInstalls || 0,
        price: app.price || 0,
        free: !!app.free,
        currency: app.currency || 'USD',
        priceText: app.priceText || (app.free ? 'Gratis' : `${app.price}`),
        genre: app.genre || '',
        genreId: app.genreId || '',
        categories: Array.isArray(app.categories) ? app.categories.map(c => c.name || c) : [],
        icon: app.icon || '',
        headerImage: app.headerImage || '',
        screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
        video: app.video || null,
        previewVideo: app.previewVideo || null,
        version: app.version || 'Varies with device',
        updated: app.updated ? new Date(app.updated).toISOString() : (app.released || null),
        released: app.released || null,
        contentRating: app.contentRating || '',
        summary: app.summary || '',
        description: app.description || '',
        recentChanges: app.recentChanges || ''
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

    const ip =
        (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        (req.socket && req.socket.remoteAddress) ||
        "unknown";

    if (!checkRate(ip)) {
        return sendJson(res, 429, { ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar." });
    }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    const action = String(body.action || "");
    const query = String(body.query || "").trim();
    const appId = String(body.appId || "").trim();

    try {
        if (action === "search") {
            if (!query) return sendJson(res, 400, { ok: false, error: "Query pencarian wajib diisi." });
            
            const results = await gplay.search({
                term: query,
                num: 10,
                lang: 'id',
                country: 'id',
                fullDetail: false // Cepat & ringan, detail diambil nanti
            });

            const apps = results.map(formatApp).filter(Boolean);
            return sendJson(res, 200, { ok: true, type: 'search', data: apps });
        }

        if (action === "detail") {
            if (!appId) return sendJson(res, 400, { ok: false, error: "App ID atau URL wajib diisi." });

            let cleanId = appId;
            const match = appId.match(/[?&]id=([a-zA-Z0-9._]+)/i);
            if (match) cleanId = match[1];

            const rawApp = await gplay.app({
                appId: cleanId,
                lang: 'id',
                country: 'id'
            });

            return sendJson(res, 200, { ok: true, type: 'detail', data: formatApp(rawApp) });
        }

        return sendJson(res, 400, { ok: false, error: "Action tidak valid. Gunakan 'search' atau 'detail'." });

    } catch (err) {
        console.error("[PLAYSTORE ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: err.message || "Gagal memproses permintaan." });
    }
}

module.exports = handler;