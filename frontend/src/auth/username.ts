export function normalizeUsername(value: string): string | undefined {
  const username = value.trim();
  if (value.length > 256 || username.length < 3 || username.length > 20
    || /[^A-Za-z0-9_]/.test(username) || !/[A-Za-z0-9]/.test(username)) return undefined;
  return username;
}
