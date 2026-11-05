import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export function developmentSettings(env: Record<string, string | undefined>) {
  const value = env.DEV_PORT ?? '5173';
  if (!value || /[^0-9]/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('DEV_PORT must be an integer from 1 through 65535.');
  }
  const target = env.DEV_API_TARGET ?? 'http://localhost:3000';
  try {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || target.includes('?') || target.includes('#') || target.trim() !== target) throw new Error();
  } catch { throw new Error('DEV_API_TARGET must be an HTTP(S) origin without credentials, path, query, or fragment.'); }
  return { port: Number(value), target };
}

export default defineConfig(({ mode, command, isPreview }) => {
  // Load only configuration names needed by the dev server. Never inject private environment settings.
  const settings = command === 'serve' && !isPreview
    ? developmentSettings({ ...loadEnv(mode, import.meta.dirname, 'DEV_'), ...process.env })
    : developmentSettings({});
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: 'localhost', port: settings.port, strictPort: true,
      proxy: { '/api': { target: settings.target, changeOrigin: false } },
    },
  };
});
