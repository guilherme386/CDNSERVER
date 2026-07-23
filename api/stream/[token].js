const { verifyMediaToken, isTokenExpired, getTokenRemainingTime } = require('../../lib/token');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { token } = req.query;

  if (!token || token.split('.').length !== 3) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const payload = verifyMediaToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (isTokenExpired(payload)) {
    return res.status(401).json({ error: 'Token expired' });
  }

  const remaining = getTokenRemainingTime(payload);
  if (remaining < 60) {
    return res.status(401).json({ error: 'Token about to expire' });
  }

  const base = (process.env.XTREAM_URL || '').replace(/\/+$/, '');
  const username = process.env.XTREAM_USERNAME;
  const password = process.env.XTREAM_PASSWORD;

  if (!base || !username || !password) {
    return res.status(500).json({ error: 'Xtream not configured' });
  }

  let targetUrl;
  if (payload.mediaType === 'live') {
    targetUrl = `${base}/live/${username}/${password}/${payload.streamId}.m3u8`;
  } else {
    targetUrl = `${base}/movie/${username}/${password}/${payload.streamId}.${payload.extension}`;
  }

  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;

  if (!proxyHost || !proxyPort) {
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${proxyHost}:${proxyPort}`;
  const proxy = new URL(proxyUrl);
  proxy.searchParams.set('url', targetUrl);

  try {
    const headers = { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    if (req.headers['if-range']) headers['If-Range'] = req.headers['if-range'];

    const proxyResponse = await fetch(proxy.toString(), {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
    });

    if (!proxyResponse.ok) {
      return res.status(proxyResponse.status).json({ error: 'Upstream error' });
    }

    const contentType = proxyResponse.headers.get('content-type');
    const contentLength = proxyResponse.headers.get('content-length');
    const contentRange = proxyResponse.headers.get('content-range');
    const acceptRanges = proxyResponse.headers.get('accept-ranges');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.status(proxyResponse.status);

    if (req.method === 'HEAD') {
      return res.end();
    }

    const reader = proxyResponse.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const ok = res.write(value);
        if (!ok) await new Promise(r => res.once('drain', r));
      }
      res.end();
    };

    await pump();
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      return res.status(502).json({ error: 'Stream proxy error' });
    }
    res.end();
  }
};
