/*
  Insomnia Dev — VT Search (TikTok Video Search)
  Base: https://getdl.space (Primary)
  Fallback: https://api.ikyyxd.my.id (Secondary)
*/

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const PRIMARY_URL = 'https://getdl.space';
const FALLBACK_URL = 'https://api.ikyyxd.my.id';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://getdl.space/id/search/tiktok',
    'Origin': 'https://getdl.space'
};

/* =========================================================
   RATE LIMIT (6 req/menit)
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
    return entry.count <= 6;
}

/* =========================================================
   CORE — PRIMARY (GetDL)
   ========================================================= */
async function searchPrimary(query, count = 10, region = 'ID') {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));

    const sessionRes = await client.get(`${PRIMARY_URL}/api/session`, { headers: HEADERS });
    if (!sessionRes.data?.success || !sessionRes.data.sessionId) {
        throw new Error('Primary gagal inisialisasi session.');
    }
    
    const payload = {
        query: query,
        count: count,
        cursor: 0,
        region: region,
        sessionId: sessionRes.data.sessionId,
        sortType: 0
    };

    const searchRes = await client.post(`${PRIMARY_URL}/api/search/tiktok`, payload, { 
        headers: { ...HEADERS, 'Content-Type': 'application/json' }
    });

    if (!searchRes.data?.success) {
        throw new Error(searchRes.data.message || 'API Error');
    }

    const { totalResults, videos } = searchRes.data.data;
    
    const results = videos.map((v, i) => ({
        index: i + 1,
        id: v.id || '',
        title: v.title || 'Tanpa judul',
        duration: v.duration ? `${v.duration}s` : '-',
        play_url: v.playUrl,
        cover_url: v.cover,
        created_at: new Date(v.createdAt).toLocaleString('id-ID')
    }));

    return {
        query: query,
        total_results: totalResults,
        data: results
    };
}

/* =========================================================
   CORE — FALLBACK (IkyyXD)
   ========================================================= */
async function searchFallback(query) {
    const res = await axios.get(`${FALLBACK_URL}/search/tiktok?query=${encodeURIComponent(query)}`, { timeout: 15000 });
    
    if (!res.data || res.data.status !== true || !res.data.result) {
        throw new Error(res.data?.message || 'Fallback API Error');
    }
    
    // Mapping hasil dari API IkyyXD ke format yang sama
    const videos = res.data.result.videos || res.data.result || [];
    const results = videos.map((v, i) => ({
        index: i + 1,
        id: v.id || '',
        title: v.title || 'Tanpa judul',
        duration: v.duration ? `${v.duration}s` : '-',
        play_url: v.play || v.play_url || v.video_url || '',
        cover_url: v.cover || v.cover_url || '',
        created_at: new Date().toLocaleString('id-ID') // fallback date
    })).filter(v => v.play_url);

    return {
        query: query,
        total_results: results.length,
        data: results
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

    const query = String(body.query || "").trim();
    
    if (!query) {
        return sendJson(res, 400, { ok: false, error: "Kata kunci pencarian wajib diisi." });
    }
    if (query.length > 100) {
        return sendJson(res, 400, { ok: false, error: "Kata kunci terlalu panjang (maks 100 karakter)." });
    }

    try {
        // Coba Primary
        let result;
        try {
            result = await searchPrimary(query);
        } catch (err) {
            console.warn("[VT SEARCH] Primary gagal, beralih ke Fallback:", err.message);
            // Jika primary gagal (404/timeout), coba Fallback
            result = await searchFallback(query);
        }

        return sendJson(res, 200, { ok: true, data: result });
    } catch (err) {
        console.error("[VT SEARCH ERR]", err.message);
        
        let errMsg = err.message;
        if (err.response && err.response.status === 404) {
            errMsg = "Layanan pencarian sedang gangguan (404). Coba lagi nanti.";
        }
        
        return sendJson(res, 500, { ok: false, error: errMsg });
    }
}

module.exports = handler;