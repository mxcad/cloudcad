import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      historyApiFallback: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        '/mxcad': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/mxcad/, '/api/mxcad'),
        },
        '/gallery': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/gallery/, '/api/gallery'),
        },
        '/drawings': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) =>
            path.replace(/^\/drawings/, '/api/gallery/drawings'),
        },
        '/blocks': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/blocks/, '/api/gallery/blocks'),
        },
        '/get_wrok_list': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/create_new_wrok': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/get_coordinate_data': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/join_work': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/exit_wrok': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/save_coordinate_file': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/push_coordinate_data': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/push_open_file': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        },
        '/files': {
          target: 'http://localhost:3091',
          changeOrigin: true,
          secure: false,
        }
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      mxcadAssetsPlugin({
        libraryNames: ['axios'],
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // 禁用严格模式以修复 WebUploader
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
