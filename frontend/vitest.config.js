import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000, // the full-app RTL flows can exceed 5s on a busy machine
    exclude: ['node_modules', 'dist', 'server/**'],
  },
});
