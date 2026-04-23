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
    err.data = data;
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
    xhr.open(method, apiUrl(p), true);
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
        const hint =
          data?.raw && String(data.raw).trim().startsWith('<')
            ? '（响应为 HTML，多为代理未转发到后端或路径前缀不匹配）'
            : '';
        reject(new Error(msg ? `${msg}${hint}` : `HTTP ${xhr.status}${hint}`));
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
