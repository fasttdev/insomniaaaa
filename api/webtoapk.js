/**
 * RFWeb2APK Builder & Converter
 * Creator: IzzXd
 * Base: https://rfweb2apk.rfdevv.com
 * Saluran: https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325
 * Note: pliss guys jangan di klaim 100% buatan lu, lu boleh kok modifikasi trs share lagi tapi tolong jangan ilangin header creator sama ch-nya
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

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

const CREATOR = 'IzzXd';
const SALURAN = 'https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325';
const BASE_URL = 'https://rfweb2apk.rfdevv.com';
const TOKEN_CACHE_FILE = path.join(__dirname, '.rfweb2apk_token.json');

let _memToken = null;

function formatSuccess(data, startTime) {
    return {
        Creator: CREATOR,
        Saluran: SALURAN,
        time: `${Date.now() - startTime}ms`,
        status: true,
        ...data
    };
}

function formatError(err, startTime) {
    let msg = err && err.message ? err.message : String(err);
    if (err && err.response && err.response.data) {
        const d = err.response.data;
        if (typeof d === 'string') msg = d;
        else if (d.error) msg = d.error;
        else if (d.message) msg = d.message;
    }
    return {
        Creator: CREATOR,
        Saluran: SALURAN,
        time: `${Date.now() - startTime}ms`,
        status: false,
        error: msg
    };
}

function loadCachedToken() {
    if (_memToken) return _memToken;
    try {
        if (fs.existsSync(TOKEN_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
            if (data && data.token) {
                _memToken = data.token;
                return data.token;
            }
        }
    } catch (_) {}
    return null;
}

function saveCachedToken(token, user = {}) {
    _memToken = token;
    try {
        fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ token, user, savedAt: Date.now() }, null, 2));
    } catch (_) {}
}

async function autoRegister() {
    _ck();
    const domainsRes = await axios.get('https://api.mail.tm/domains');
    const domainList = domainsRes.data && domainsRes.data['hydra:member'];
    if (!domainList || !domainList.length) throw new Error('Gagal mendapatkan domain temp-mail.');
    const domain = domainList[0].domain;

    const rnd = crypto.randomBytes(4).toString('hex');
    const email = `rf_${rnd}@${domain}`;
    const password = `Pass_${rnd}!123`;
    const username = `rf_${rnd}`;

    await axios.post('https://api.mail.tm/accounts', { address: email, password });
    const authRes = await axios.post('https://api.mail.tm/token', { address: email, password });
    const mailToken = authRes.data.token;

    await axios.post(`${BASE_URL}/api/auth/register`, {
        email, username, password, phone: '08123456789'
    }, {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });

    let otp = null;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const listRes = await axios.get('https://api.mail.tm/messages', {
            headers: { 'Authorization': `Bearer ${mailToken}` }
        });
        const members = listRes.data && listRes.data['hydra:member'];
        if (members && members.length > 0) {
            const msgId = members[0].id;
            const detailRes = await axios.get(`https://api.mail.tm/messages/${msgId}`, {
                headers: { 'Authorization': `Bearer ${mailToken}` }
            });
            const text = (detailRes.data && (detailRes.data.text || detailRes.data.intro)) || '';
            const match = text.match(/\b\d{6}\b/);
            if (match) { otp = match[0]; break; }
        }
    }

    if (!otp) throw new Error('Kode verifikasi OTP email tidak diterima tepat waktu.');

    const verifyRes = await axios.post(`${BASE_URL}/api/auth/verify-register`, {
        email, code: otp
    }, {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });

    if (verifyRes.data && verifyRes.data.token) {
        saveCachedToken(verifyRes.data.token, verifyRes.data.user);
        return verifyRes.data.token;
    }
    throw new Error('Verifikasi registrasi gagal.');
}

async function getOrRefreshToken(forceNew = false) {
    if (!forceNew) {
        const cached = loadCachedToken();
        if (cached) return cached;
    }
    return await autoRegister();
}

async function build(appName, packageName, targetUrl, options = {}) {
    _ck();
    const startTime = Date.now();
    try {
        const cleanName = String(appName || '').trim();
        const cleanPkg = String(packageName || '').trim();
        const cleanUrl = String(targetUrl || '').trim();

        if (!cleanName) throw new Error('Nama aplikasi (appName) wajib diisi.');
        if (!cleanPkg) throw new Error('Package name (packageName) wajib diisi.');
        if (!cleanUrl) throw new Error('URL website target wajib diisi.');

        let token = options.token || loadCachedToken();
        if (!token) token = await getOrRefreshToken();

        const executeBuild = async (authToken) => {
            const fd = new FormData();
            fd.append('appName', cleanName);
            fd.append('packageName', cleanPkg);
            fd.append('versionName', options.versionName || '1.0');
            fd.append('versionCode', String(options.versionCode || 1));
            fd.append('outputFormat', options.outputFormat || 'apk');
            fd.append('url', cleanUrl);
            fd.append('splashType', options.splashType || 'default');
            fd.append('orientation', options.orientation || 'auto');

            if (options.icon && fs.existsSync(options.icon)) {
                fd.append('icon', fs.createReadStream(options.icon));
            }

            const headers = {
                ...fd.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            try {
                const res = await axios.post(`${BASE_URL}/api/apk/build`, fd, { headers, timeout: 120000 });
                return res.data;
            } catch (err) {
                if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
                    await new Promise(r => setTimeout(r, 4000));
                    const history = await getHistory(authToken);
                    if (history && history.status && Array.isArray(history.history)) {
                        const matched = history.history.find(h => h.appName === cleanName || h.packageName === cleanPkg);
                        if (matched) {
                            return {
                                success: true,
                                fileName: matched.fileName,
                                size: matched.fileSize,
                                downloadUrl: matched.downloadUrl,
                                buildId: matched.id,
                                message: 'APK berhasil dibuild'
                            };
                        }
                    }
                }
                throw err;
            }
        };

        let resultData;
        try {
            resultData = await executeBuild(token);
        } catch (err) {
            const errRes = err.response && err.response.data;
            if (errRes && (errRes.code === 'LIMIT_REACHED' || (errRes.error && errRes.error.includes('Guest')))) {
                token = await getOrRefreshToken(true);
                resultData = await executeBuild(token);
            } else {
                throw err;
            }
        }

        if (resultData && resultData.success) {
            const directDl = resultData.downloadUrl.startsWith('http') ? resultData.downloadUrl : `${BASE_URL}${resultData.downloadUrl}`;
            const sizeMb = (resultData.size / (1024 * 1024)).toFixed(2);
            return formatSuccess({
                message: resultData.message || 'APK berhasil dibuild.',
                appName: cleanName,
                packageName: cleanPkg,
                targetUrl: cleanUrl,
                fileName: resultData.fileName,
                fileSize: resultData.size,
                fileSizeFormatted: `${sizeMb} MB`,
                downloadUrl: directDl,
                buildId: resultData.buildId || null
            }, startTime);
        }
        throw new Error((resultData && (resultData.error || resultData.message)) || 'Gagal membuat APK.');
    } catch (err) {
        return formatError(err, startTime);
    }
}

async function scrapeHtml(url) {
    _ck();
    const startTime = Date.now();
    try {
        const cleanUrl = String(url || '').trim();
        if (!cleanUrl) throw new Error('URL target wajib diisi.');
        const res = await axios.post(`${BASE_URL}/api/scrape-html`, { url: cleanUrl }, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 25000
        });
        if (res.data && res.data.success) {
            return formatSuccess({ url: cleanUrl, html: res.data.html }, startTime);
        }
        throw new Error((res.data && res.data.error) || 'Gagal mengambil HTML dari URL.');
    } catch (err) {
        return formatError(err, startTime);
    }
}

async function getHistory(customToken = null) {
    _ck();
    const startTime = Date.now();
    try {
        const token = customToken || loadCachedToken();
        if (!token) throw new Error('Token tidak ditemukan. Silakan jalankan build terlebih dahulu.');
        const res = await axios.get(`${BASE_URL}/api/apk/history`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 15000
        });
        if (res.data && res.data.success) {
            const items = (res.data.history || []).map(h => ({
                ...h,
                downloadUrl: h.downloadUrl.startsWith('http') ? h.downloadUrl : `${BASE_URL}${h.downloadUrl}`
            }));
            return formatSuccess({ history: items }, startTime);
        }
        throw new Error((res.data && res.data.error) || 'Gagal mengambil riwayat build.');
    } catch (err) {
        return formatError(err, startTime);
    }
}

/* =========================================================
   RATE LIMIT
   ========================================================= */
const rateStore = new Map();

function checkRate(ip) {
    const now = Date.now();
    const entry = rateStore.get(ip) || { count: 0, reset: now + 60000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
    entry.count++;
    rateStore.set(ip, entry);
    return entry.count <= 6;
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

    const action = String(body.action || "").toLowerCase();

    try {
        _ck();
    } catch (e) {
        console.error("[WEB2APK] integrity check failed:", e.message);
        return sendJson(res, 500, { ok: false, error: "Layanan tidak tersedia." });
    }

    if (action === "build") {
        const appName = String(body.appName || "").trim();
        const packageName = String(body.packageName || "").trim();
        const url = String(body.url || "").trim();
        const versionName = String(body.versionName || "1.0").trim();
        const versionCode = parseInt(body.versionCode, 10) || 1;
        const orientation = String(body.orientation || "auto").trim();

        if (!appName) return sendJson(res, 400, { ok: false, error: "Nama aplikasi wajib diisi." });
        if (appName.length > 60) return sendJson(res, 400, { ok: false, error: "Nama aplikasi maksimal 60 karakter." });

        if (!packageName) return sendJson(res, 400, { ok: false, error: "Package name wajib diisi." });
        if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
            return sendJson(res, 400, { ok: false, error: "Package name tidak valid. Contoh: com.example.app" });
        }

        if (!url) return sendJson(res, 400, { ok: false, error: "URL wajib diisi." });
        if (!/^https?:\/\//i.test(url)) return sendJson(res, 400, { ok: false, error: "URL harus dimulai dengan http:// atau https://" });

        if (["auto", "portrait", "landscape"].indexOf(orientation) === -1) {
            return sendJson(res, 400, { ok: false, error: "Orientasi tidak valid." });
        }

        const result = await build(appName, packageName, url, {
            versionName,
            versionCode,
            orientation
        });

        if (!result.status) return sendJson(res, 500, { ok: false, error: result.error });
        return sendJson(res, 200, { ok: true, data: result });
    }

    if (action === "history") {
        const result = await getHistory();
        if (!result.status) return sendJson(res, 500, { ok: false, error: result.error });
        return sendJson(res, 200, { ok: true, data: result });
    }

    return sendJson(res, 400, { ok: false, error: "Action tidak valid. Gunakan 'build' atau 'history'." });
}

module.exports = handler;
module.exports.build = build;
module.exports.getHistory = getHistory;
module.exports.scrapeHtml = scrapeHtml;