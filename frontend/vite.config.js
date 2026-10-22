import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api is proxied to the Worker (`npm run dev:api` at the repo root).
// In production both are served from the same Cloudflare Worker origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
