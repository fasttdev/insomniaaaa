// api/index.js
const routes = {
  '/api/download':    require('./_lib/download'),
  '/api/stalktt':     require('./_lib/stalktt'),
  '/api/req':         require('./_lib/req'),
  '/api/wainspector': require('./_lib/wainspector'),
  '/api/webtoapk':    require('./_lib/webtoapk'),
  '/api/bypass':      require('./_lib/bypass'),
  '/api/vtsearch':    require('./_lib/vtsearch'),
  '/api/pinterest':   require('./_lib/pinterest'),
  '/api/texttoimage': require('./_lib/texttoimage'),
  '/api/playstore':   require('./_lib/playstore'),
  '/api/googlesearch':require('./_lib/googlesearch'),
  '/api/igstalker':   require('./_lib/igstalker'),
  '/api/facebook':    require('./_lib/facebook'),
};

module.exports = async (req, res) => {
  // Ambil path tanpa query string
  const url = req.url.split('?')[0];
  
  // Cari handler yang cocok
  const handler = routes[url];

  if (handler) {
    return handler(req, res);
  }

  // Kalau endpoint nggak ada
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: "Endpoint tidak ditemukan." }));
};