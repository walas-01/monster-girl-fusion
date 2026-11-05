export function googleClientId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 256 && value.trim() === value
    && /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : undefined;
}
