import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const environment = {
  production: {
    apiKey:
      'pk_5737e4589a0ee39506612c1d7f47d682aa50262380a6694a015f30e1c98b8bb6',
    baseUrl: 'https://api.altertable.ai',
  },
  development: {
    apiKey:
      'pk_187a3cf49bab97f7caa4d219f7f218f5ba1c1c8ecb65f969844cc4a702ef4508',
    baseUrl: 'https://api.altertable.dev',
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  define: {
    __ALTERTABLE_API_KEY__: JSON.stringify(
      environment[process.env.NODE_ENV].apiKey
    ),
    __ALTERTABLE_BASE_URL__: JSON.stringify(
      environment[process.env.NODE_ENV].baseUrl
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
