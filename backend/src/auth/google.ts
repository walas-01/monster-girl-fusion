import { OAuth2Client, gaxios } from 'google-auth-library';
import type { Config } from '../config.js';
import type { VerifiedIdentity } from './users.js';
import { ApiError } from '../middleware/api-error.js';

export type GoogleVerifier = (credential: string) => Promise<VerifiedIdentity>;

export function createGoogleClient(clientId: string) {
  const client = new OAuth2Client({ clientId, issuers: ['accounts.google.com', 'https://accounts.google.com'],
    transporterOptions: { timeout: 5_000, retry: false } });
  // Certificate fetching enables retries per request; override them at the final transport boundary.
  client.transporter.interceptors.request.add({ async resolved(options) {
    options.timeout = 5_000;
    options.retry = false;
    options.retryConfig = { ...options.retryConfig, retry: 0 };
    return options;
  } });
  return client;
}

export function createGoogleVerifier(config: Pick<Config, 'googleClientId'>,
  client = createGoogleClient(config.googleClientId)): GoogleVerifier {
  return async (credential) => {
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
      const claims = ticket.getPayload();
      if (!claims || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
        || claims.aud !== config.googleClientId || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000
        || typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255
        || claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 320
        || claims.email.trim() !== claims.email
        || !/^[^@\s]+@[^@\s]+$/.test(claims.email)
        || (claims.azp !== undefined && claims.azp !== config.googleClientId)) {
        throw new ApiError('INVALID_GOOGLE_TOKEN');
      }
      return { subject: claims.sub, email: claims.email };
    } catch (error) {
      // Library verification errors can contain the complete credential. Never log or return them.
      throw new ApiError(error instanceof gaxios.GaxiosError ? 'AUTH_UNAVAILABLE' : 'INVALID_GOOGLE_TOKEN');
    }
  };
}
