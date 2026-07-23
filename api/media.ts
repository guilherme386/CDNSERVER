import type { IncomingMessage, ServerResponse } from 'http';
import { json, error, cors, validateApiKey, checkRateLimit } from '../src/shared/utils/http';
import { XtreamService } from '../src/shared/services/xtream';
import { logger } from '../src/shared/utils/logger';

const xtream = () => new XtreamService({
  url: process.env.XTREAM_URL || '',
  username: process.env.XTREAM_USERNAME || '',
  password: process.env.XTREAM_PASSWORD || '',
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(res, req.headers.origin as string);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!validateApiKey(req)) {
    return error(res, 'Chave de API inválida ou ausente.', 401);
  }

  if (!checkRateLimit('media', 60000, 60)) {
    return error(res, 'Muitas requisições.', 429);
  }

  const url = new URL(req.url || '/', `https://${req.headers.host}`);
  const path = url.pathname.replace('/api/media', '');

  try {
    const service = xtream();

    if (path === '/live' && req.method === 'GET') {
      const categories = await service.getLiveCategories();
      return json(res, { categories });
    }

    if (path.startsWith('/live/') && req.method === 'GET') {
      const categoryId = path.split('/')[2];
      const streams = await service.getLiveStreams(categoryId);
      return json(res, { streams });
    }

    if (path === '/vod' && req.method === 'GET') {
      const categories = await service.getVodCategories();
      return json(res, { categories });
    }

    if (path.startsWith('/vod/') && req.method === 'GET') {
      const categoryId = path.split('/')[2];
      const streams = await service.getVodStreams(categoryId);
      return json(res, { streams });
    }

    if (path === '/series' && req.method === 'GET') {
      const categories = await service.getSeriesCategories();
      return json(res, { categories });
    }

    if (path.match(/^\/series\/\d+$/) && req.method === 'GET') {
      const categoryId = path.split('/')[2];
      const seriesList = await service.getSeries(categoryId);
      return json(res, { series: seriesList });
    }

    if (path.match(/^\/series\/\d+\/info$/) && req.method === 'GET') {
      const seriesId = path.split('/')[2];
      const info = await service.getSeriesInfo(seriesId);
      if (!info) return error(res, 'Série não encontrada.', 404);
      return json(res, { info });
    }

    if (path.match(/^\/series\/\d+\/episodes\/\d+$/) && req.method === 'GET') {
      const parts = path.split('/');
      const seriesId = parts[2];
      const season = parseInt(parts[4], 10);
      if (isNaN(season)) return error(res, 'Season deve ser um número.', 400);
      const episodes = await service.getSeriesEpisodes(seriesId, season);
      return json(res, { episodes });
    }

    return error(res, 'Rota não encontrada.', 404);
  } catch (err) {
    logger.error('Media route error', { error: String(err) });
    return error(res, 'Erro interno do servidor.', 500);
  }
}
