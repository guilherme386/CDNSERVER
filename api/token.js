const { createMediaToken } = require('../lib/token');
const { XtreamService } = require('../lib/xtream');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { mediaId, mediaType, duration, extension } = req.body || {};

  if (!mediaId || !mediaType) {
    return res.status(400).json({ error: 'mediaId and mediaType are required' });
  }

  if (!['live', 'vod', 'series'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be live, vod, or series' });
  }

  try {
    const xtream = new XtreamService({
      url: process.env.XTREAM_URL,
      username: process.env.XTREAM_USERNAME,
      password: process.env.XTREAM_PASSWORD,
    });

    const mediaInfo = await xtream.getMediaInfo(mediaId, mediaType);
    if (!mediaInfo) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const ext = mediaType === 'live' ? 'm3u8' : (extension || 'mp4');
    const dur = duration || (mediaInfo.duration ? Math.ceil(mediaInfo.duration / 60) : 120);

    const token = createMediaToken(mediaId, mediaId, ext, mediaType, dur);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const expiresAt = new Date(payload.exp * 1000);

    return res.status(201).json({
      token,
      url: `https://${process.env.CDN_DOMAIN}/api/stream/${token}`,
      expiresAt: expiresAt.toISOString(),
      duration: dur,
    });
  } catch (err) {
    console.error('Token error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
