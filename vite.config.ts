import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/  ·  https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The lazy-loaded app chunk is mostly Firebase Auth + Firestore (~190 kB gzipped).
    chunkSizeWarningLimit: 800,
  },
  test: {
    // Pure-function tests only (rules, reviews, csv, backup, dates); no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
