import type { IncomingMessage, ServerResponse } from 'http';
import { json, error, cors, validateApiKey, readBody, checkRateLimit } from '../src/shared/utils/http.js';
import { createMediaToken } from '../src/shared/utils/token.js';
import { XtreamService } from '../src/shared/services/xtream.js';
import { logger } from '../src/shared/utils/logger.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(res, req.headers.origin as string);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return error(res, 'Método não permitido.', 405);
  }

  if (!validateApiKey(req)) {
    return error(res, 'Chave de API inválida ou ausente.', 401);
  }

  if (!checkRateLimit('token', 60000, 30)) {
    return error(res, 'Muitas requisições. Tente novamente mais tarde.', 429);
  }

  const body = await readBody(req);
  const { mediaId, mediaType, duration, extension } = body as {
    mediaId?: string;
    mediaType?: string;
    duration?: number;
    extension?: string;
  };

  if (!mediaId || !mediaType) {
    return error(res, 'mediaId e mediaType são obrigatórios.', 400);
  }

  if (!['live', 'vod', 'series'].includes(mediaType)) {
    return error(res, 'mediaType deve ser "live", "vod" ou "series".', 400);
  }

  try {
    const xtream = new XtreamService({
      url: process.env.XTREAM_URL || '',
      username: process.env.XTREAM_USERNAME || '',
      password: process.env.XTREAM_PASSWORD || '',
    });

    const mediaInfo = await xtream.getMediaInfo(mediaId, mediaType as 'live' | 'vod' | 'series');
    if (!mediaInfo) {
      return error(res, 'Mídia não encontrada no servidor Xtream.', 404);
    }

    const ext = mediaType === 'live' ? 'm3u8' : (extension || 'mp4');
    const streamId = mediaId;
    const dur = duration || (mediaInfo.duration ? Math.ceil(mediaInfo.duration / 60) : 120);

    const token = createMediaToken(mediaId, streamId, ext, mediaType as 'live' | 'vod' | 'series', dur);

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const expiresAt = new Date(payload.exp * 1000);

    const cdnDomain = process.env.CDN_DOMAIN || '';

    logger.info('Token generated', { mediaId, mediaType });

    return json(res, {
      token,
      url: `https://${cdnDomain}/api/stream/${token}`,
      expiresAt: expiresAt.toISOString(),
      duration: dur,
    }, 201);
  } catch (err) {
    logger.error('Token generation error', { error: String(err) });
    return error(res, 'Erro interno ao gerar token.', 500);
  }
}
