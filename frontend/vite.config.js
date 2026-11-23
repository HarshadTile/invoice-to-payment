import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // VITE_PORT lets a developer match a callback URL registered elsewhere (e.g. SSO testing on 5187).
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    proxy: {
      // All of /api goes to FastAPI, including an SSO callback path set by SSO_CALLBACK_PATH.
      // VITE_API_TARGET: where the backend runs (e.g. http://127.0.0.1:8080 for SSO testing).
      '/api': process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
    },
  },
})
