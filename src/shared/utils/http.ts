import type { IncomingMessage, ServerResponse } from 'http';

export function cors(res: ServerResponse, origin?: string): void {
  const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const reqOrigin = origin || '';

  if (allowed.includes(reqOrigin) || allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function json(res: ServerResponse, data: unknown, status: number = 200): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

export function error(res: ServerResponse, message: string, status: number): void {
  json(res, { error: 'Error', message, statusCode: status }, status);
}

export function getApiKey(req: IncomingMessage): string {
  return (req.headers['x-api-key'] as string) || '';
}

export function validateApiKey(req: IncomingMessage): boolean {
  const apiKey = process.env.API_KEY || '';
  const provided = getApiKey(req);
  return !!apiKey && provided === apiKey;
}

export async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

export function checkRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const store = globalThis as Record<string, unknown>;
  if (!store.__rateLimit) store.__rateLimit = new Map<string, number[]>();

  const rl = store.__rateLimit as Map<string, number[]>;
  const timestamps = rl.get(key) || [];
  const valid = timestamps.filter(t => now - t < windowMs);

  if (valid.length >= max) return false;

  valid.push(now);
  rl.set(key, valid);
  return true;
}
