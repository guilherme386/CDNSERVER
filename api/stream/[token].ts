import type { IncomingMessage, ServerResponse } from 'http';
import { verifyMediaToken, isTokenExpired, getTokenRemainingTime } from '../../src/shared/utils/token.js';
import { json, error, cors } from '../../src/shared/utils/http.js';
import { logger } from '../../src/shared/utils/logger.js';
import type { TokenPayload } from '../../src/shared/types/index.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(res, req.headers.origin as string);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `https://${req.headers.host}`);
  const pathParts = url.pathname.split('/');
  const token = pathParts[pathParts.length - 1];

  if (!token || token.split('.').length !== 3) {
    return error(res, 'Token inválido.', 401);
  }

  const payload = verifyMediaToken(token);
  if (!payload) {
    return error(res, 'Token inválido ou expirado.', 401);
  }

  if (isTokenExpired(payload)) {
    return error(res, 'Token expirado.', 401);
  }

  const remaining = getTokenRemainingTime(payload);
  if (remaining < 60) {
    return error(res, 'Token prestes a expirar.', 401);
  }

  const targetUrl = buildTargetUrl(payload);
  if (!targetUrl) {
    return error(res, 'Erro ao construir URL de streaming.', 500);
  }

  const proxyUrl = buildProxyUrl(targetUrl);
  if (!proxyUrl) {
    return error(res, 'Proxy não configurado.', 500);
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    };

    const range = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
    if (range) headers['Range'] = range;

    const ifRange = Array.isArray(req.headers['if-range']) ? req.headers['if-range'][0] : req.headers['if-range'];
    if (ifRange) headers['If-Range'] = ifRange;

    const proxyResponse = await fetch(proxyUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
    });

    if (!proxyResponse.ok) {
      logger.error('Upstream error', { status: proxyResponse.status });
      return error(res, 'Erro ao obter mídia do upstream.', proxyResponse.status);
    }

    const contentType = proxyResponse.headers.get('Content-Type');
    const contentLength = proxyResponse.headers.get('Content-Length');
    const contentRange = proxyResponse.headers.get('Content-Range');
    const acceptRanges = proxyResponse.headers.get('Accept-Ranges');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.statusCode = proxyResponse.status;

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const reader = proxyResponse.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }

    const pump = async (): Promise<void> => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const canContinue = res.write(value);
        if (!canContinue) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    };

    await pump();
  } catch (err) {
    logger.error('Stream proxy error', { error: String(err) });
    if (!res.headersSent) {
      return error(res, 'Erro ao processar streaming.', 502);
    }
    res.end();
  }
}

function buildTargetUrl(payload: TokenPayload): string | null {
  const base = process.env.XTREAM_URL?.replace(/\/+$/, '');
  if (!base) return null;

  const username = process.env.XTREAM_USERNAME;
  const password = process.env.XTREAM_PASSWORD;
  if (!username || !password) return null;

  switch (payload.mediaType) {
    case 'live':
      return `${base}/live/${username}/${password}/${payload.streamId}.m3u8`;
    case 'vod':
    case 'series':
      return `${base}/movie/${username}/${password}/${payload.streamId}.${payload.extension}`;
    default:
      return null;
  }
}

function buildProxyUrl(targetUrl: string): string | null {
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  if (!proxyHost || !proxyPort) return null;

  const proxyUser = process.env.PROXY_USER || '';
  const proxyPass = process.env.PROXY_PASS || '';

  const proxy = new URL(`http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`);
  proxy.searchParams.set('url', targetUrl);
  return proxy.toString();
}
