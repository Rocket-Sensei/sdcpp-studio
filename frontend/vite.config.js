import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = process.env.BACKEND_PORT || '3000';
const backendUrl = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: process.env.HOST || '0.0.0.0',
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true
      },
      '/sdapi': {
        target: backendUrl,
        changeOrigin: true
      },
      '/ws': {
        target: backendUrl,
        changeOrigin: true,
        ws: true
      },
      '/static': {
        target: backendUrl,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
