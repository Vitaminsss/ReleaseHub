import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  // 生产默认 /releasehub/ 与 deploy.sh 默认 NGINX_PREFIX 一致；本地开发默认 /
  const base = env.VITE_BASE || (mode === 'production' ? '/releasehub/' : '/');

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: {
      outDir: path.resolve(__dirname, '../public'),
      emptyOutDir: true,
      assetsDir: 'assets',
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        '/releases': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        '/d': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        '/app': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        '/r': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        '/rd': { target: 'http://127.0.0.1:3721', changeOrigin: true },
        // 子路径部署：apiUrl 为 /releasehub/api/... 时需剥掉前缀再转发到后端
        '^/releasehub/api': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/releases': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/app': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/d': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/r': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/rd': {
          target: 'http://127.0.0.1:3721',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
      },
    },
  };
});
