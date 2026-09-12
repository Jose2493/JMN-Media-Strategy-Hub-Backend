import jwt from 'jsonwebtoken';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export class SocialSessionError extends Error {
  constructor() {
    super('Invalid or expired session');
    this.name = 'SocialSessionError';
  }
}

function assertUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new SocialSessionError();
  }
}

export function verifySocialSessionAuthorizationHeader(
  authorizationHeader,
  secret = process.env.SESSION_JWT_SECRET
) {
  if (typeof authorizationHeader !== 'string' || typeof secret !== 'string' || secret.length < 16) {
    throw new SocialSessionError();
  }

  const match = BEARER_PATTERN.exec(authorizationHeader);
  if (!match) {
    throw new SocialSessionError();
  }

  let decoded;
  try {
    decoded = jwt.verify(match[1], secret, {
      algorithms: ['HS256'],
      complete: false,
    });
  } catch {
    throw new SocialSessionError();
  }

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new SocialSessionError();
  }

  assertUuid(decoded.companyId);
  assertUuid(decoded.contactId);

  return Object.freeze({
    companyId: decoded.companyId,
    contactId: decoded.contactId,
  });
}
