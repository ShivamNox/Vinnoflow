import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: backend, changeOrigin: true },
      '/login':     { target: backend, changeOrigin: true },
      '/logout':    { target: backend, changeOrigin: true },
      '/setup':     { target: backend, changeOrigin: true },
      '/profile':   { target: backend, changeOrigin: true },
      '/cloud':     { target: backend, changeOrigin: true },
      '/stream':    { target: backend, changeOrigin: true },
      '/download':  { target: backend, changeOrigin: true },
      '/share':     { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
});
