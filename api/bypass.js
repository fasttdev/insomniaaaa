/**
 * AdLinkSumo Link Bypasser
 * Creator: IzzXd
 * Base: https://adlinksumo.com
 * Saluran: https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325
 */

const axios = require('axios');
const crypto = require('crypto');

const CREATOR = 'IzzXd';
const SALURAN = 'https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class AdlinksumoBypasser {
    constructor() {
        this.cookies = {};
    }

    saveCookies(headers) {
        const raw = headers && headers['set-cookie'];
        if (!raw || !Array.isArray(raw)) return;
        raw.forEach(c => {
            const parts = c.split(';')[0].split('=');
            const key = parts[0].trim();
            const val = parts.slice(1).join('=');
            if (key) {
                this.cookies[key] = val;
            }
        });
    }

    getCookieHeader() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    generateToken(cookieXsrf) {
        const rawXsrf = decodeURIComponent(cookieXsrf || '');
        const randomHash = crypto.createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex');
        const encodedHash = '#' + Buffer.from(randomHash).toString('base64');
        return rawXsrf.slice(0, 128 - encodedHash.length) + encodedHash;
    }

    cleanDestinationUrl(raw) {
        if (!raw) return null;
        let cleaned = raw.trim();
        cleaned = cleaned.replace(/\\+(\/)/g, '$1');
        return cleaned;
    }

    async resolveDirectDownload(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            if (/mediafire\.com/i.test(url)) {
                const res = await axios.get(url, {
                    headers: { 'User-Agent': DEFAULT_UA },
                    timeout: 10000,
                    validateStatus: null
                });
                const html = typeof res.data === 'string' ? res.data : '';
                const match = html.match(/id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i) ||
                              html.match(/href=["'](https?:\/\/download[^"']+)["']/i) ||
                              html.match(/aria-label=["']Download file["'][^>]*href=["']([^"']+)["']/i);
                if (match && match[1]) {
                    return match[1];
                }
            }
        } catch (_) {}
        return null;
    }

    async bypass(targetUrl) {
        const startTime = Date.now();
        try {
            if (!targetUrl || typeof targetUrl !== 'string') {
                throw new Error('URL target tidak valid');
            }

            let normalizedUrl = targetUrl.trim();
            if (!/^https?:\/\//i.test(normalizedUrl)) {
                normalizedUrl = 'https://' + normalizedUrl;
            }

            const parsedTarget = new URL(normalizedUrl);
            const alias = parsedTarget.pathname.replace(/^\/+|\/+$/g, '');

            if (!alias) {
                throw new Error('Slug alias link tidak ditemukan pada URL');
            }

            const initialRes = await axios.get(normalizedUrl, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Accept': 'application/json, text/html, */*'
                },
                maxRedirects: 5,
                validateStatus: null
            });

            this.saveCookies(initialRes.headers);

            let gatewayUrl = null;
            let rayId = null;

            if (typeof initialRes.data === 'object' && initialRes.data !== null && initialRes.data.url) {
                gatewayUrl = initialRes.data.url;
                rayId = initialRes.data.ray_id;
            } else if (typeof initialRes.data === 'string') {
                const actionMatch = initialRes.data.match(/action=["']([^"']+)["']/i);
                const rayMatch = initialRes.data.match(/name=["']ray_id["']\s+value=["']([^"']+)["']/i);
                if (actionMatch && rayMatch) {
                    gatewayUrl = actionMatch[1];
                    rayId = rayMatch[1];
                }
            }

            if (!gatewayUrl || !rayId) {
                throw new Error('Gagal mendeteksi gateway redirect dari AdLinkSumo');
            }

            const gatewayOrigin = new URL(gatewayUrl).origin;

            const hop1 = await axios.get(`${gatewayUrl}?ray_id=${encodeURIComponent(rayId)}&alias=${encodeURIComponent(alias)}`, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': normalizedUrl
                },
                maxRedirects: 0,
                validateStatus: null
            });

            this.saveCookies(hop1.headers);

            const articlePath1 = hop1.headers['location'];
            if (!articlePath1) {
                throw new Error('Gagal mendapatkan rute artikel tahap 1');
            }

            const articleUrl1 = new URL(articlePath1, gatewayOrigin).href;
            const articleRes1 = await axios.get(articleUrl1, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': `${gatewayUrl}?ray_id=${encodeURIComponent(rayId)}&alias=${encodeURIComponent(alias)}`,
                    'Cookie': this.getCookieHeader()
                },
                maxRedirects: 0,
                validateStatus: null
            });

            this.saveCookies(articleRes1.headers);

            const token1 = this.generateToken(this.cookies['XSRF-TOKEN']);
            const sessionRes1 = await axios.post(`${gatewayOrigin}/api/session`, { _token: token1 }, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': articleUrl1,
                    'Origin': gatewayOrigin,
                    'Cookie': this.getCookieHeader(),
                    'Content-Type': 'application/json'
                },
                validateStatus: null
            });

            this.saveCookies(sessionRes1.headers);

            const verifyRes1 = await axios.post(`${gatewayOrigin}/api/verify`, { _a: 0 }, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': articleUrl1,
                    'Origin': gatewayOrigin,
                    'Cookie': this.getCookieHeader(),
                    'Content-Type': 'application/json'
                },
                validateStatus: null
            });

            this.saveCookies(verifyRes1.headers);

            const target2 = verifyRes1.data && verifyRes1.data.target;
            if (!target2) {
                throw new Error('Gagal menyelesaikan verifikasi tahap 1');
            }

            const hop2 = await axios.get(target2, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': articleUrl1,
                    'Cookie': this.getCookieHeader()
                },
                maxRedirects: 0,
                validateStatus: null
            });

            this.saveCookies(hop2.headers);

            const articlePath2 = hop2.headers['location'];
            if (!articlePath2) {
                throw new Error('Gagal mendapatkan rute artikel tahap 2');
            }

            const articleUrl2 = new URL(articlePath2, gatewayOrigin).href;
            const articleRes2 = await axios.get(articleUrl2, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': target2,
                    'Cookie': this.getCookieHeader()
                },
                maxRedirects: 0,
                validateStatus: null
            });

            this.saveCookies(articleRes2.headers);

            const token2 = this.generateToken(this.cookies['XSRF-TOKEN']);
            const sessionRes2 = await axios.post(`${gatewayOrigin}/api/session`, { _token: token2 }, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': articleUrl2,
                    'Origin': gatewayOrigin,
                    'Cookie': this.getCookieHeader(),
                    'Content-Type': 'application/json'
                },
                validateStatus: null
            });

            this.saveCookies(sessionRes2.headers);

            const randKey = Math.floor(Math.random() * 1000);
            const sizeVal = (1920 + randKey) * 2 + '.' + (1080 + randKey) * 2;
            const goRes = await axios.post(`${gatewayOrigin}/api/go`, {
                key: randKey,
                size: sizeVal,
                ado: null
            }, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': articleUrl2,
                    'Origin': gatewayOrigin,
                    'Cookie': this.getCookieHeader(),
                    'Content-Type': 'application/json'
                },
                validateStatus: null
            });

            const readyUrl = goRes.data && goRes.data.url;
            if (!readyUrl) {
                throw new Error('Gagal memperoleh URL final dari api/go');
            }

            const readyRes = await axios.get(readyUrl, {
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Referer': gatewayOrigin
                },
                maxRedirects: 5,
                validateStatus: null
            });

            let destinationUrl = null;
            if (readyRes.request && readyRes.request.res && readyRes.request.res.responseUrl && readyRes.request.res.responseUrl !== readyUrl) {
                destinationUrl = readyRes.request.res.responseUrl;
            }

            if (!destinationUrl && typeof readyRes.data === 'string') {
                const locMatch = readyRes.data.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i) ||
                                 readyRes.data.match(/location\.href\s*=\s*["']([^"']+)["']/i);
                if (locMatch) {
                    destinationUrl = this.cleanDestinationUrl(locMatch[1]);
                }
            }

            if (!destinationUrl && typeof readyRes.data === 'string') {
                const btnMatch = readyRes.data.match(/href=["'](https?:\/\/[^"']+)["']/i);
                if (btnMatch) {
                    destinationUrl = this.cleanDestinationUrl(btnMatch[1]);
                }
            }

            if (!destinationUrl) {
                throw new Error('Gagal mengekstrak URL destinasi akhir');
            }

            const directDownload = await this.resolveDirectDownload(destinationUrl);

            return {
                Creator: CREATOR,
                Saluran: SALURAN,
                time: `${Date.now() - startTime}ms`,
                status: true,
                result: {
                    short_url: normalizedUrl,
                    destination_url: destinationUrl,
                    direct_download: directDownload || null
                }
            };
        } catch (err) {
            return {
                Creator: CREATOR,
                Saluran: SALURAN,
                time: `${Date.now() - startTime}ms`,
                status: false,
                error: err.message || 'Gagal bypass link AdLinkSumo'
            };
        }
    }
}

async function bypass(url) {
    const inst = new AdlinksumoBypasser();
    return await inst.bypass(url);
}

/* =========================================================
   RATE LIMIT
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
        return sendJson(res, 400, { ok: false, error: "URL wajib diisi." });
    }
    if (!/^https?:\/\//i.test(url)) {
        return sendJson(res, 400, { ok: false, error: "URL harus dimulai dengan http:// atau https://" });
    }

    try {
        const result = await bypass(url);
        if (!result.status) {
            return sendJson(res, 400, { ok: false, error: result.error });
        }
        return sendJson(res, 200, { ok: true, data: result.result });
    } catch (err) {
        console.error("[BYPASS ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: "Gagal memproses link." });
    }
}

module.exports = handler;
module.exports.bypass = bypass;