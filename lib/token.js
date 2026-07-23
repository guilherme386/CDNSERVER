const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET || '';
const EXTRA_EXPIRATION_MINUTES = parseInt(process.env.EXTRA_EXPIRATION_MINUTES || '60', 10);

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

function createMediaToken(mediaId, streamId, extension, mediaType, durationMinutes = 120) {
  const now = Math.floor(Date.now() / 1000);
  const expirationSeconds = (durationMinutes + EXTRA_EXPIRATION_MINUTES) * 60;

  const payload = {
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

function verifyMediaToken(token) {
  try {
    return jwt.verify(token, TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: 'cdn-server',
      audience: 'cdn-client',
    });
  } catch {
    return null;
  }
}

function isTokenExpired(payload) {
  const now = Math.floor(Date.now() / 1000);
  return now > payload.exp;
}

function getTokenRemainingTime(payload) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}

module.exports = { createMediaToken, verifyMediaToken, isTokenExpired, getTokenRemainingTime };
