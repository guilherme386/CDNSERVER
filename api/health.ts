import type { IncomingMessage, ServerResponse } from 'http';
import { json, cors } from '../src/shared/utils/http';
import { ProxyService } from '../src/shared/services/proxy';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(res, req.headers.origin as string);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const proxy = new ProxyService({
    host: process.env.PROXY_HOST || '',
    port: parseInt(process.env.PROXY_PORT || '2101', 10),
    username: process.env.PROXY_USER || '',
    password: process.env.PROXY_PASS || '',
  });

  const proxyOk = await proxy.healthCheck().catch(() => false);

  return json(res, {
    status: proxyOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      proxy: proxyOk ? 'connected' : 'unreachable',
    },
  }, proxyOk ? 200 : 503);
}
