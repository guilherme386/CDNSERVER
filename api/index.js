const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function createToken(mediaId, streamId, extension, mediaType, durationMinutes) {
  const secret = process.env.TOKEN_SECRET;
  const extra = parseInt(process.env.EXTRA_EXPIRATION_MINUTES || '60', 10);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (durationMinutes + extra) * 60;
  return jwt.sign({ mediaId, mediaType, streamId, extension, exp, iat: now, jti: crypto.randomBytes(8).toString('hex') }, secret, { algorithm: 'HS256', issuer: 'cdn', audience: 'client' });
}

function verifyToken(token) {
  try { return jwt.verify(token, process.env.TOKEN_SECRET, { algorithms: ['HS256'], issuer: 'cdn', audience: 'client' }); } catch { return null; }
}

function jsonRes(res, data, status) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status || 200).json(data);
}

function checkKey(req) {
  return req.headers['x-api-key'] === process.env.API_KEY;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (path === '/' || path === '') {
    return jsonRes(res, { error: 'Not found' }, 404);
  }

  if (path === '/api/health') {
    let proxyOk = false;
    try {
      const proxyUrl = 'http://' + process.env.PROXY_USER + ':' + process.env.PROXY_PASS + '@' + process.env.PROXY_HOST + ':' + process.env.PROXY_PORT;
      const r = await fetch(proxyUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      proxyOk = r.ok || r.status === 405;
    } catch (e) { proxyOk = false; }
    return jsonRes(res, { status: proxyOk ? 'healthy' : 'degraded', proxy: proxyOk ? 'connected' : 'unreachable', timestamp: new Date().toISOString() }, proxyOk ? 200 : 503);
  }

  if (path === '/api/token' && req.method === 'POST') {
    if (!checkKey(req)) return jsonRes(res, { error: 'Invalid API key' }, 401);
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');
    const mediaId = parsed.mediaId;
    const mediaType = parsed.mediaType;
    const duration = parsed.duration;
    const extension = parsed.extension;
    if (!mediaId || !mediaType) return jsonRes(res, { error: 'mediaId and mediaType required' }, 400);
    if (['live', 'vod', 'series'].indexOf(mediaType) === -1) return jsonRes(res, { error: 'Invalid mediaType' }, 400);
    const ext = mediaType === 'live' ? 'm3u8' : (extension || 'mp4');
    const dur = duration || 120;
    const token = createToken(mediaId, mediaId, ext, mediaType, dur);
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return jsonRes(res, { token: token, url: 'https://' + process.env.CDN_DOMAIN + '/api/stream/' + token, expiresAt: new Date(p.exp * 1000).toISOString(), duration: dur }, 201);
  }

  if (path.indexOf('/api/stream/') === 0) {
    const token = path.replace('/api/stream/', '');
    const payload = verifyToken(token);
    if (!payload) return jsonRes(res, { error: 'Invalid or expired token' }, 401);
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) return jsonRes(res, { error: 'Token expired' }, 401);
    const base = (process.env.XTREAM_URL || '').replace(/\/+$/, '');
    const u = process.env.XTREAM_USERNAME;
    const pw = process.env.XTREAM_PASSWORD;
    let targetUrl;
    if (payload.mediaType === 'live') targetUrl = base + '/live/' + u + '/' + pw + '/' + payload.streamId + '.m3u8';
    else targetUrl = base + '/movie/' + u + '/' + pw + '/' + payload.streamId + '.' + payload.extension;
    const proxyUrl = 'http://' + process.env.PROXY_USER + ':' + process.env.PROXY_PASS + '@' + process.env.PROXY_HOST + ':' + process.env.PROXY_PORT + '?url=' + encodeURIComponent(targetUrl);
    try {
      const headers = { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' };
      const range = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
      if (range) headers['Range'] = range;
      const upstream = await fetch(proxyUrl, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: headers });
      if (!upstream.ok) return jsonRes(res, { error: 'Upstream error' }, upstream.status);
      const ct = upstream.headers.get('content-type');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (ct) res.setHeader('Content-Type', ct);
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstream.status);
      if (req.method === 'HEAD') return res.end();
      const reader = upstream.body.getReader();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        if (!res.write(result.value)) await new Promise(function (r) { res.once('drain', r); });
      }
      res.end();
    } catch (e) {
      if (!res.headersSent) return jsonRes(res, { error: 'Stream error' }, 502);
      res.end();
    }
    return;
  }

  if (path.indexOf('/api/media') === 0) {
    if (!checkKey(req)) return jsonRes(res, { error: 'Invalid API key' }, 401);
    const mediaPath = path.replace('/api/media', '').replace(/^\/+/, '');
    const authUrl = function (action, params) {
      params = params || {};
      const u = new URL(process.env.XTREAM_URL + '/player_api.php');
      u.searchParams.set('username', process.env.XTREAM_USERNAME);
      u.searchParams.set('password', process.env.XTREAM_PASSWORD);
      u.searchParams.set('action', action);
      Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
      return u.toString();
    };
    const fetchJson = async function (url) {
      const r = await fetch(url);
      return r.ok ? await r.json() : [];
    };
    try {
      if (mediaPath === 'live') return jsonRes(res, { categories: await fetchJson(authUrl('get_live_categories')) });
      if (mediaPath.indexOf('live/') === 0) return jsonRes(res, { streams: await fetchJson(authUrl('get_live_streams', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath === 'vod') return jsonRes(res, { categories: await fetchJson(authUrl('get_vod_categories')) });
      if (mediaPath.indexOf('vod/') === 0) return jsonRes(res, { streams: await fetchJson(authUrl('get_vod_streams', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath === 'series') return jsonRes(res, { categories: await fetchJson(authUrl('get_series_categories')) });
      if (mediaPath.indexOf('series/') === 0 && mediaPath.indexOf('info') === -1 && mediaPath.indexOf('episodes') === -1) return jsonRes(res, { series: await fetchJson(authUrl('get_series', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath.indexOf('series/') !== -1 && mediaPath.indexOf('info') !== -1) return jsonRes(res, { info: await fetchJson(authUrl('get_series_info', { series_id: mediaPath.split('/')[1] })) });
      if (mediaPath.indexOf('episodes') !== -1) {
        const parts = mediaPath.split('/');
        const data = await fetchJson(authUrl('get_series_info', { series_id: parts[1], season: parts[3] }));
        return jsonRes(res, { episodes: (data.episodes && data.episodes[parts[3]]) ? data.episodes[parts[3]] : [] });
      }
      return jsonRes(res, { error: 'Not found' }, 404);
    } catch (e) {
      return jsonRes(res, { error: 'Internal error' }, 500);
    }
  }

  return jsonRes(res, { error: 'Not found' }, 404);
};


