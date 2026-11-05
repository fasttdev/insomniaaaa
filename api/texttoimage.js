/**
 * ImageFree AI Image Generator
 * Creator: IzzXd
 * Base: https://imagefree.net
 */

const BASE_URL = 'https://imagefree.net';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* =========================================================
   RATE LIMIT (3 req/5 menit)
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
   CORE FUNCTIONS
   ========================================================= */
async function generate(prompt, aspectRatio) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('Prompt tidak boleh kosong');
    }

    const cleanPrompt = prompt.trim();
    const ratio = aspectRatio || '1:1';

    const genRes = await fetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL
        },
        body: JSON.stringify({
            prompt: cleanPrompt,
            aspect_ratio: ratio
        })
    });

    const genJson = await genRes.json().catch(() => ({}));
    if (genJson.error || !genJson.taskId) {
        throw new Error(genJson.error || 'Gagal memulai proses generate gambar');
    }

    const taskId = genJson.taskId;
    const maxAttempts = 30;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const statusRes = await fetch(`${BASE_URL}/api/generate/status?taskId=${taskId}`, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': `${BASE_URL}/`
            }
        });

        const statusJson = await statusRes.json().catch(() => ({}));
        if (statusJson.error) {
            throw new Error(statusJson.error || 'Terjadi kesalahan saat memproses gambar');
        }

        if (statusJson.status === 'completed' && statusJson.image) {
            return {
                prompt: cleanPrompt,
                aspect_ratio: ratio,
                task_id: taskId,
                image_url: statusJson.image
            };
        }

        if (statusJson.status === 'failed') {
            throw new Error('Proses pembuatan gambar gagal di server');
        }
    }

    throw new Error('Waktu pembuatan gambar melebihi batas (timeout)');
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
        return sendJson(res, 429, { ok: false, error: "Terlalu banyak permintaan. Tunggu 5 menit lagi." });
    }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    const prompt = String(body.prompt || "").trim();
    const aspectRatio = String(body.aspectRatio || "1:1").trim();

    if (!prompt) {
        return sendJson(res, 400, { ok: false, error: "Prompt tidak boleh kosong." });
    }
    if (prompt.length > 1000) {
        return sendJson(res, 400, { ok: false, error: "Prompt terlalu panjang (maks 1000 karakter)." });
    }

    try {
        const result = await generate(prompt, aspectRatio);
        return sendJson(res, 200, { ok: true, data: result });
    } catch (err) {
        console.error("[TEXT2IMG ERR]", err.message);
        return sendJson(res, 500, { ok: false, error: err.message || "Gagal membuat gambar." });
    }
}

module.exports = handler;