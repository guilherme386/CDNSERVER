const { XtreamService } = require('../../lib/xtream');

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

  const { slug } = req.query;
  const parts = (slug || []).join('/');

  try {
    const service = getXtream();

    if (parts === 'live') {
      const categories = await service.getLiveCategories();
      return res.json({ categories });
    }

    if (parts.startsWith('live/')) {
      const id = parts.split('/')[1];
      const streams = await service.getLiveStreams(id);
      return res.json({ streams });
    }

    if (parts === 'vod') {
      const categories = await service.getVodCategories();
      return res.json({ categories });
    }

    if (parts.startsWith('vod/')) {
      const id = parts.split('/')[1];
      const streams = await service.getVodStreams(id);
      return res.json({ streams });
    }

    if (parts === 'series') {
      const categories = await service.getSeriesCategories();
      return res.json({ categories });
    }

    if (parts.match(/^series\/\d+$/) && !parts.includes('info') && !parts.includes('episodes')) {
      const id = parts.split('/')[1];
      const series = await service.getSeries(id);
      return res.json({ series });
    }

    if (parts.match(/^series\/\d+\/info$/)) {
      const id = parts.split('/')[1];
      const info = await service.getSeriesInfo(id);
      if (!info) return res.status(404).json({ error: 'Series not found' });
      return res.json({ info });
    }

    if (parts.match(/^series\/\d+\/episodes\/\d+$/)) {
      const seriesId = parts.split('/')[1];
      const season = parseInt(parts.split('/')[3], 10);
      const episodes = await service.getSeriesEpisodes(seriesId, season);
      return res.json({ episodes });
    }

    return res.status(404).json({ error: 'Route not found' });
  } catch (err) {
    console.error('Media error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
