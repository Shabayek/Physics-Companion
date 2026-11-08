/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Separate caches let several dev servers (e.g. E2E online/offline) run side by side.
  ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {}),
  // supabase-js is imported lazily; pre-bundle it so the dev server never reloads mid-session.
  optimizeDeps: { include: ['@supabase/supabase-js'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}'],
    // UI tests play whole flows with user-event; leave headroom for slower machines.
    testTimeout: 20_000,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
