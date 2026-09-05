import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // The fullstack build (Cloudflare Worker / Docker) is served from the domain
  // root, so assets must use an absolute base — otherwise a document served at a
  // non-root path (OAuth callback, deep SPA route refresh) resolves `./assets/…`
  // against the wrong prefix and 404s. The default GitHub Pages build keeps a
  // relative base so it works under a project subpath.
  base: mode === 'fullstack' ? '/' : './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Forward API calls (and /api/rooms WebSockets) to the local Hono server.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}))
