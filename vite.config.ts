import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  // Explicitly check for HMR disable flag, default to false if explicitly requested
  const disableHmr = process.env.DISABLE_HMR === 'true';
  
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: disableHmr ? false : {
        clientPort: 443,
        timeout: 5000,
        overlay: false // disable the error overlay to prevent UI interruption on websocket close
      },
      watch: disableHmr ? null : {},
    },
  };
});
