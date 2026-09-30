import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 47231,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 180000,
    hookTimeout: 180000,
  },
})
