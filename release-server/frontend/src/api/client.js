import { useAuthStore } from '@/stores/auth';
import router from '@/router';

function redirectToLoginIfNeeded() {
  const r = router.currentRoute.value;
  if (r.meta.requiresAuth) {
    router.replace({ name: 'login', query: { redirect: r.fullPath } });
  }
}

/** 与 Vite base 一致，保证子路径部署下 /api 经 Nginx 前缀转发 */
function appBase() {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : `${b}/`;
}

function apiUrl(p) {
  if (p.startsWith('http')) return p;
  const rel = p.startsWith('/') ? p.slice(1) : p;
  return `${appBase()}${rel}`;
}

/**
 * 大文件 XHR 的目标 URL。
 *
 * 为何不用「始终同源」的 apiUrl：
 * - `npm run build` 后 `import.meta.env.DEV` 为 false，若经 Vite 预览(4173) 或反代/ CDN，体积分支常见为 1MB(Nginx 默认) 或 100MB(部分 CDN)，会在到达 Node 前 413。
 * - 在本地 5173/4173 时直连 Node（与 server 默认 PORT 一致），可绕过前端的 dev/preview 代理体积分支。
 * - 自托管若需绕过某层反代，可设 `VITE_UPLOAD_API_ORIGIN` 指向能直达 Node 的根地址（如 `https://同域名:3721` 或内网地址）。
 */
function uploadXhrUrl(p) {
  if (p.startsWith('http')) return p;
  let path = p.startsWith('/') ? p : `/${p}`;
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  if (basePath && path.startsWith(`${basePath}/`)) {
    path = path.slice(basePath.length) || '/';
  }
  if (import.meta.env.VITE_UPLOAD_SAME_ORIGIN === '1') {
    return apiUrl(path);
  }
  const explicit = String(import.meta.env.VITE_UPLOAD_API_ORIGIN || '').trim().replace(/\/$/, '');
  if (explicit) {
    return `${explicit}${path.startsWith('/') ? path : `/${path}`}`;
  }
  const localPorts = (import.meta.env.VITE_BYPASS_PROXY_UPLOAD_PORTS || '5173,4173')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
  const isLocal = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const isBypassPort =
    typeof location !== 'undefined' && location.port && localPorts.includes(location.port);
  if (import.meta.env.DEV || (isLocal && isBypassPort)) {
    const o = (import.meta.env.VITE_DEV_UPLOAD_ORIGIN || 'http://127.0.0.1:3721').replace(/\/$/, '');
    return `${o}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return apiUrl(path);
}

export async function api(method, path, body = null, options = {}) {
  const auth = useAuthStore();
  const headers = { ...options.headers };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const isForm = body instanceof FormData;
  if (body != null && !isForm && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
    signal: options.signal,
  });

  if (res.status === 401) {
    auth.logout();
    redirectToLoginIfNeeded();
    throw new Error('未授权');
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    if (data != null) err.data = data;
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return null;

  return data;
}

/**
 * XMLHttpRequest 上传，带真实进度（0–100）
 */
export function uploadWithProgress({ method, path: p, formData, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const auth = useAuthStore();
    xhr.open(method, uploadXhrUrl(p), true);
    if (auth.token) xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);

    if (signal) {
      const onAbort = () => {
        xhr.abort();
        reject(new Error('已取消'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      xhr.onloadend = () => signal.removeEventListener('abort', onAbort);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      } else if (onProgress) {
        onProgress(-1);
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText || '';
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (xhr.status === 401) {
        auth.logout();
        redirectToLoginIfNeeded();
        reject(new Error('未授权'));
        return;
      }
      if (xhr.status >= 400) {
        const msg =
          data && typeof data === 'object' && !data.raw
            ? data.error || data.message
            : null;
        let hint = '';
        if (data?.raw && String(data.raw).trim().startsWith('<')) {
          hint =
            xhr.status === 413
              ? '（413 且为 HTML：常见为 Nginx 请求体上限默认 1m、或 Cloudflare 等约 100MB 限制；请在反代 location 内设 client_max_body_size，或构建时设 VITE_UPLOAD_API_ORIGIN 直连 Node）'
              : '（响应为 HTML，多为代理未转发到后端或路径前缀不匹配）';
        }
        const e = new Error(msg ? `${msg}${hint}` : `HTTP ${xhr.status}${hint}`);
        e.status = xhr.status;
        if (data && typeof data === 'object' && !data.raw) e.data = data;
        reject(e);
        return;
      }
      if (data && typeof data === 'object' && data.raw != null && !('uploaded' in data)) {
        const snippet = String(data.raw).slice(0, 120).replace(/\s+/g, ' ');
        reject(
          new Error(
            `服务器返回非 JSON（可能是前端路由回退页）: ${snippet}${snippet.length >= 120 ? '…' : ''}`,
          ),
        );
        return;
      }
      if (typeof onProgress === 'function') onProgress(100);
      resolve(data);
    };

    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error('已取消'));

    xhr.send(formData);
  });
}
