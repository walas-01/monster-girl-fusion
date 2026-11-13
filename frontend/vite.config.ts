import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import type { ConfigEnv, UserConfig } from 'vite'

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd(), 'DEV_')
  const port = Number(env.DEV_PORT ?? '5173')

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DEV_PORT must be an integer between 1 and 65535.')
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.DEV_API_TARGET ?? 'http://localhost:3000',
        },
      },
    },
    preview: {
      strictPort: true,
      proxy: {},
    },
  }
})
