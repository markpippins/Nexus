import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://172.16.30.23:8004',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://172.16.30.23:8004',
        changeOrigin: true,
      },
      '/system': {
        target: 'http://172.16.30.23:8004',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})