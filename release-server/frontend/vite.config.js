import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  // 生产默认 /releasehub/ 与 deploy.sh 默认 NGINX_PREFIX 一致；本地开发默认 /
  const base = env.VITE_BASE || (mode === 'production' ? '/releasehub/' : '/');

  const proxyBase = {
    changeOrigin: true,
    /** 大文件上传/长时间传输，避免代理默认超时时长过短 */
    timeout: 600_000,
    proxyTimeout: 600_000,
  };

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
        '/api': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/releases': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/d': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/app': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/r': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/rd': { target: 'http://127.0.0.1:3721', ...proxyBase },
        '/tt': { target: 'http://127.0.0.1:3721', ...proxyBase },
        // 子路径部署：apiUrl 为 /releasehub/api/... 时需剥掉前缀再转发到后端
        '^/releasehub/api': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/releases': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/app': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/d': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/r': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/rd': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
        '^/releasehub/tt': {
          target: 'http://127.0.0.1:3721',
          ...proxyBase,
          rewrite: p => p.replace(/^\/releasehub/, ''),
        },
      },
    },
  };
});
