const { XtreamService } = require('../lib/xtream');

function getXtream() {
  return new XtreamService({
    url: process.env.XTREAM_URL,
    username: process.env.XTREAM_USERNAME,
    password: process.env.XTREAM_PASSWORD,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { path } = req.query;
  const fullPath = path ? `/api/media/${path}` : '/api/media';

  try {
    const service = getXtream();

    if (fullPath === '/api/media/live') {
      const categories = await service.getLiveCategories();
      return res.json({ categories });
    }

    if (fullPath.match(/^\/api\/media\/live\/\d+$/)) {
      const id = fullPath.split('/')[4];
      const streams = await service.getLiveStreams(id);
      return res.json({ streams });
    }

    if (fullPath === '/api/media/vod') {
      const categories = await service.getVodCategories();
      return res.json({ categories });
    }

    if (fullPath.match(/^\/api\/media\/vod\/\d+$/)) {
      const id = fullPath.split('/')[4];
      const streams = await service.getVodStreams(id);
      return res.json({ streams });
    }

    if (fullPath === '/api/media/series') {
      const categories = await service.getSeriesCategories();
      return res.json({ categories });
    }

    if (fullPath.match(/^\/api\/media\/series\/\d+$/)) {
      const id = fullPath.split('/')[4];
      const series = await service.getSeries(id);
      return res.json({ series });
    }

    if (fullPath.match(/^\/api\/media\/series\/\d+\/info$/)) {
      const id = fullPath.split('/')[4];
      const info = await service.getSeriesInfo(id);
      if (!info) return res.status(404).json({ error: 'Series not found' });
      return res.json({ info });
    }

    if (fullPath.match(/^\/api\/media\/series\/\d+\/episodes\/\d+$/)) {
      const parts = fullPath.split('/');
      const seriesId = parts[4];
      const season = parseInt(parts[6], 10);
      const episodes = await service.getSeriesEpisodes(seriesId, season);
      return res.json({ episodes });
    }

    return res.status(404).json({ error: 'Route not found' });
  } catch (err) {
    console.error('Media error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
