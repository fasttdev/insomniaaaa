/**
 * Google Search & Image Scraper (via Bing)
 * Creator: IzzXd
 * Base: https://www.google.com
 */

const axios = require('axios');
const cheerio = require('cheerio');

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

    const action = String(body.action || "web");
    const query = String(body.query || "").trim();

    if (!query) {
        return sendJson(res, 400, { ok: false, error: "Query pencarian wajib diisi." });
    }
    if (query.length > 200) {
        return sendJson(res, 400, { ok: false, error: "Query terlalu panjang (maks 200 karakter)." });
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    try {
        if (action === "image") {
            const { data } = await axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`, { headers, timeout: 15000 });
            const $ = cheerio.load(data);
            const results = [];
            $('a.iusc').each((i, el) => {
                const m = $(el).attr('m');
                if (m) {
                    try {
                        const parsed = JSON.parse(m);
                        if (parsed.murl) results.push(parsed.murl);
                    } catch(e) {}
                }
            });
            return sendJson(res, 200, { ok: true, type: "image", data: [...new Set(results)].slice(0, 20) });
        } else {
            const { data } = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { headers, timeout: 15000 });
            const $ = cheerio.load(data);
            const results = [];
            $('li.b_algo').each((i, el) => {
                const title = $(el).find('h2 a').text().trim();
                const rawUrl = $(el).find('h2 a').attr('href');
                if (title && rawUrl) {
                    let url = rawUrl;
                    if (rawUrl.includes('/ck/a?!')) {
                        const uMatch = rawUrl.match(/&u=a1([^&]+)/);
                        if (uMatch) url = Buffer.from(uMatch[1], 'base64').toString();
                    }
                    results.push({ title, url });
                }
            });
            return sendJson(res, 200, { ok: true, type: "web", data: results.slice(0, 15) });
        }
    } catch (err) {
        console.error("[GOOGLE SEARCH ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: "Gagal mengambil hasil pencarian." });
    }
}

module.exports = handler;