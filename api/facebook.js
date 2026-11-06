/**
 * Facebook Downloader
 * Creator: IzzXd
 * Base: https://www.facebook.com
 * Note: pliss guys jangan di klaim 100% buatan lu, lu boleh kok modifikasi trs share lagi tapi tolong jangan ilangin header creator sama ch-nya
 */

const fs = require('fs');
const crypto = require('crypto');

const _p = ["fJMupwGtP5IrlSHzB608x3nEdfsErTvFeMd081GnP5Ap", "w3XyVqs9w32RI6cD+GrEeJYnpgT4PsEolCOiAao8xw=="];
const _k = [0x4d, 0xa1, 0x17, 0xc3, 0x62, 0x9e, 0x0b, 0xf4];

function _ld() {
    const raw = Buffer.from(_p.join(''), 'base64');
    const out = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ _k[i % _k.length];
    return out.toString('utf8');
}

function _hd() {
    try {
        const src = fs.readFileSync(__filename, 'utf8');
        const m = src.match(/^\s*\/\*\*[\s\S]*?\*\//);
        if (!m) return '';
        const keys = ['Creator:', 'Saluran:', 'Note:'];
        const lines = m[0].split('\n').map(l => l.replace(/^\s*\*?\s*/, '').replace(/\s+/g, ''));
        const pick = keys.map(k => lines.find(l => l.startsWith(k)));
        if (pick.some(x => !x)) return '';
        return crypto.createHash('sha256').update(pick.join('')).digest('hex');
    } catch (_) {
        return '';
    }
}

function _ck() {
    const h = _hd();
    if (!h || h !== _ld()) throw new Error('ctx invalid');
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\u00a0/g, ' ')
        .trim();
}

function decodeUnicode(str) {
    if (!str) return '';
    try {
        return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
    } catch (_) {
        return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
                  .replace(/\\\//g, '/');
    }
}

function cleanUrl(url) {
    if (!url) return null;
    return decodeHtmlEntities(decodeUnicode(url)).replace(/\\\//g, '/');
}

async function resolveCanonicalUrl(targetUrl) {
    try {
        const res = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
            }
        });
        const location = res.headers.get('location');
        if (location) {
            return location.startsWith('http') ? location : `https://www.facebook.com${location}`;
        }
    } catch (_) {}
    return targetUrl;
}

async function fetchPage(targetUrl) {
    const finalUrl = await resolveCanonicalUrl(targetUrl);
    const res = await fetch(finalUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    });

    if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to fetch Facebook page: HTTP ${res.status}`);
    }

    const html = await res.text();
    return { html, url: finalUrl };
}

function parseMetadata(html, fallbackUrl) {
    const ogTitle = (html.match(/<meta\s+property=["']og:title["']\s+content=["']([\s\S]*?)["']/i) || [])[1];
    const ogDesc = (html.match(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i) || [])[1];
    const ogImage = (html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) || [])[1];
    const ogUrl = (html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i) || [])[1];

    let title = ogTitle ? decodeHtmlEntities(decodeUnicode(ogTitle)) : null;
    let description = ogDesc ? decodeHtmlEntities(decodeUnicode(ogDesc)) : null;
    let thumbnail = cleanUrl(ogImage);
    let canonicalUrl = ogUrl ? cleanUrl(ogUrl) : fallbackUrl;

    let author = null;
    let views = null;
    let reactions = null;

    if (title && title.includes('|')) {
        const parts = title.split('|').map(s => s.trim());
        if (parts.length >= 3) {
            const stats = parts[0];
            const statMatch = stats.match(/([\d.,\s]+[KkMmBb]?(?:rb|jt)?\s*(?:views|tayangan|ditonton))\s*[·•-]\s*([\d.,\s]+[KkMmBb]?(?:rb|jt)?\s*(?:reactions|suka|tanggapan|reaksi)?)/i);
            if (statMatch) {
                views = statMatch[1].trim();
                reactions = statMatch[2].trim();
            } else {
                views = stats;
            }
            const fullContent = parts.slice(1, -1).join(' | ').trim();
            const firstLine = fullContent.split('\n').map(l => l.trim()).find(l => l.length > 0);
            title = firstLine || fullContent;
            description = fullContent;
            author = parts[parts.length - 1];
        } else if (parts.length === 2) {
            title = parts[0];
            author = parts[1];
        }
    }

    if (!author) {
        const authorMatch = html.match(/"owner":\{"__typename":"User","id":"[^"]*","name":"([^"]+)"/) ||
                            html.match(/"actors":\[\{"__typename":"User","id":"[^"]*","name":"([^"]+)"/) ||
                            html.match(/"video_owner":\{[^}]*"name":"([^"]+)"/) ||
                            html.match(/"name":"([^"]+)","__typename":"Page"/) ||
                            html.match(/"name":"([^"]+)","__typename":"User"/);
        if (authorMatch) author = decodeUnicode(authorMatch[1]);
    }

    if (!thumbnail) {
        const thumbMatch = html.match(/"preferred_thumbnail":\{"image":\{"uri":"([^"]+)"/);
        if (thumbMatch) thumbnail = cleanUrl(thumbMatch[1]);
    }

    let duration = null;
    const durMatch = html.match(/"duration_s":\s*(\d+(?:\.\d+)?)/) || html.match(/"playable_duration_in_ms":\s*(\d+)/);
    if (durMatch) {
        const durVal = parseFloat(durMatch[1]);
        duration = durMatch[0].includes('ms') ? Math.round(durVal / 1000) : Math.round(durVal);
    }

    let hd = null;
    let sd = null;

    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
    if (hdMatch) hd = cleanUrl(hdMatch[1]);

    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
    if (sdMatch) sd = cleanUrl(sdMatch[1]);

    let id = null;
    const idPatterns = [
        /\/reel\/(\d+)/i,
        /\/videos\/(?:[^\/]+\/)?(\d+)/i,
        /\/posts\/(\d+)/i,
        /[?&]v=(\d+)/i,
        /[?&](?:video_id|story_fbid)=(\d+)/i,
        /\/(\d{12,25})(?:\/|\?|$)/
    ];
    for (const p of idPatterns) {
        const m = canonicalUrl && canonicalUrl.match(p);
        if (m) {
            id = m[1];
            break;
        }
    }

    return {
        id: id || null,
        url: canonicalUrl,
        title: title || 'Facebook Video',
        description: description || null,
        author: author || null,
        stats: {
            views: views || null,
            reactions: reactions || null
        },
        duration: duration ? `${duration}s` : null,
        duration_seconds: duration || null,
        thumbnail: thumbnail || null,
        downloads: {
            hd: hd || null,
            sd: sd || null
        }
    };
}

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

    const url = String(body.url || "").trim();

    if (!url) {
        return sendJson(res, 400, { ok: false, error: "URL Facebook wajib diisi." });
    }
    if (!/^https?:\/\//i.test(url)) {
        return sendJson(res, 400, { ok: false, error: "URL harus dimulai dengan http:// atau https://" });
    }

    const t0 = Date.now();
    try {
        _ck();
        const { html, url: finalUrl } = await fetchPage(url);
        const data = parseMetadata(html, finalUrl);

        if (!data.downloads.hd && !data.downloads.sd) {
            throw new Error('Gagal mengekstrak video stream. Pastikan video publik dan link masih aktif.');
        }

        return sendJson(res, 200, { ok: true, data });
    } catch (err) {
        console.error("[FB DL ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: err.message || "Gagal memproses video." });
    }
}

module.exports = handler;
module.exports.download = async function(url) {
    _ck();
    const { html, url: finalUrl } = await fetchPage(url);
    return parseMetadata(html, finalUrl);
};