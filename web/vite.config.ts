import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Disable buffering for SSE streaming endpoints
        configure: (proxy) => {
          const sseEndpoints = ['/stream', '/api/assess', '/api/estimate'];
          const isSSE = (url?: string) => url && sseEndpoints.some(ep => url.includes(ep));
          proxy.on('proxyReq', (proxyReq, req) => {
            if (isSSE(req.url)) {
              proxyReq.setHeader('Accept', 'text/event-stream');
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            if (isSSE(req.url)) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
