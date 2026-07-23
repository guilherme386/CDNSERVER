import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { TokenPayload } from '../types/index.js';

const TOKEN_SECRET = process.env.TOKEN_SECRET || '';
const EXTRA_EXPIRATION_MINUTES = parseInt(process.env.EXTRA_EXPIRATION_MINUTES || '60', 10);

function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function createMediaToken(
  mediaId: string,
  streamId: string,
  extension: string,
  mediaType: 'live' | 'vod' | 'series',
  durationMinutes: number = 120
): string {
  const now = Math.floor(Date.now() / 1000);
  const expirationSeconds = (durationMinutes + EXTRA_EXPIRATION_MINUTES) * 60;

  const payload: TokenPayload = {
    mediaId,
    mediaType,
    streamId,
    extension,
    exp: now + expirationSeconds,
    iat: now,
    jti: generateId(),
  };

  return jwt.sign(payload, TOKEN_SECRET, {
    algorithm: 'HS256',
    issuer: 'cdn-server',
    audience: 'cdn-client',
  });
}

export function verifyMediaToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: 'cdn-server',
      audience: 'cdn-client',
    }) as TokenPayload;

    return decoded;
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: TokenPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now > payload.exp;
}

export function getTokenRemainingTime(payload: TokenPayload): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}

export function createApiSignature(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyApiSignature(data: string, signature: string, secret: string): boolean {
  const expected = createApiSignature(data, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
