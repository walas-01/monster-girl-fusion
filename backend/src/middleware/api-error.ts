const definitions = {
  INVALID_JSON: [400, 'Request body must be valid JSON.'],
  INVALID_REQUEST: [400, 'The request is invalid.'],
  INVALID_USERNAME: [400, 'Username must contain 3 to 20 ASCII letters, digits, or underscores and include a letter or digit.'],
  USERNAME_TAKEN: [409, 'This username is already in use.'],
  USERNAME_ALREADY_SET: [409, 'A username has already been selected for this account.'],
  USERNAME_UNAVAILABLE: [503, 'Username setup is temporarily unavailable.'],
  INVALID_GOOGLE_TOKEN: [401, 'The Google credential is invalid or expired.'],
  AUTH_REQUIRED: [401, 'Authentication is required.'],
  CSRF_INVALID: [403, 'Request security checks failed.'],
  HTTPS_REQUIRED: [403, 'HTTPS is required.'],
  ONBOARDING_REQUIRED: [403, 'Account onboarding is required.'],
  BODY_TOO_LARGE: [413, 'Request body exceeds the size limit.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Content-Type must be application/json with UTF-8 encoding.'],
  AUTH_UNAVAILABLE: [503, 'Authentication is temporarily unavailable.'],
  SESSION_UNAVAILABLE: [503, 'Session storage is temporarily unavailable.'],
} as const;

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof definitions) {
    super(definitions[code][1]);
    this.status = definitions[code][0];
    this.name = 'ApiError';
  }
}
