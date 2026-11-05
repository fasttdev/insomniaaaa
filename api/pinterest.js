/**
 * Pinterest Scraper (Search & Downloader Image/Video)
 * Creator: IzzXd
 * Base: https://www.pinterest.com
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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
   CORE FUNCTIONS
   ========================================================= */
async function search(query, limit = 20) {
    if (!query) throw new Error('Query pencarian tidak boleh kosong');

    const res = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000)
    });

    const json = await res.json();
    const rawList = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

    const results = rawList.slice(0, limit).map(item => {
        const rawImg = item.image_url || item.image || item.images?.orig?.url || '';
        // Ubah resolusi ke 736x agar bisa di-embed (originals di-block hotlink)
        const cleanImg = rawImg.replace(/\/\d+x\d*([_\/])/, '/736x$1').replace(/\/\d+x\//, '/736x/');

        return {
            id: item.id || null,
            title: item.grid_title || item.title || '',
            description: (item.description || '').trim(),
            pin: item.pin || (item.id ? `https://www.pinterest.com/pin/${item.id}/` : null),
            type: item.type || 'image',
            image: cleanImg || null,
            video: item.video_url || null,
            pinner: {
                username: item.pinner?.username || '',
                name: item.pinner?.full_name || ''
            }
        };
    });

    return results;
}

async function download(targetUrl) {
    if (!targetUrl) throw new Error('URL Pinterest tidak boleh kosong');

    let initialUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(initialUrl)) initialUrl = 'https://' + initialUrl;

    const res = await fetch(initialUrl, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000)
    });

    const finalUrl = res.url;
    const html = await res.text();

    const rawTitle = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
    const title = rawTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim();
    const description = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] || '').trim();

    const rawVids = [...new Set(html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi) || [])];
    const cleanVids = rawVids
        .map(v => v.replace(/&amp;/g, '&'))
        .filter(v => v.includes('pinimg.com'));

    const bestVid = cleanVids.find(v => v.includes('720w')) ||
                    cleanVids.find(v => v.includes('540w')) ||
                    cleanVids.find(v => v.includes('360w')) ||
                    cleanVids[0] ||
                    null;

    const hashMatches = [...html.matchAll(/\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:jpg|jpeg|png|webp))/gi)]
        .map(m => m[1])
        .filter(h => !h.includes('d53b014d86a6b6761bf649a0ed813c2b'));

    const uniqueHashes = [...new Set(hashMatches)];
    // Pakai 736x agar tidak 403 saat didownload / dirender
    const image = uniqueHashes[0] ? `https://i.pinimg.com/736x/${uniqueHashes[0]}` : null;

    return {
        title: title || 'Pinterest Media',
        description,
        url: finalUrl,
        type: bestVid ? 'video' : 'image',
        video: bestVid,
        image: image,
        allVideos: cleanVids
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
    const url = String(body.url || "").trim();

    try {
        if (action === "search") {
            if (!query) return sendJson(res, 400, { ok: false, error: "Query pencarian wajib diisi." });
            const results = await search(query);
            return sendJson(res, 200, { ok: true, type: 'search', data: results });
        } 
        
        if (action === "download") {
            if (!url) return sendJson(res, 400, { ok: false, error: "URL Pinterest wajib diisi." });
            const result = await download(url);
            return sendJson(res, 200, { ok: true, type: 'download', data: result });
        }

        return sendJson(res, 400, { ok: false, error: "Action tidak valid. Gunakan 'search' atau 'download'." });
    } catch (err) {
        console.error("[PINTEREST ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: err.message || "Gagal memproses permintaan." });
    }
}

module.exports = handler;