import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the static build works from any subpath (GitHub Pages,
  // a project folder on Vercel, plain static hosting).
  base: './',
  build: {
    rollupOptions: {
      output: {
        // TensorFlow.js is large by nature; keeping it in its own chunk means the
        // interface and its cached copy are not invalidated by app-only changes.
        manualChunks: {
          tfjs: ['@tensorflow/tfjs'],
          react: ['react', 'react-dom', 'react-dom/client', 'react-dom/server'],
        },
      },
    },
    chunkSizeWarningLimit: 1700, // tfjs is one 1.6 MB vendor chunk by nature
  },
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
