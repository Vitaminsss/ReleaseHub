/**
 * 与后端 base-url.js 一致：BASE + /包名/版本目录/文件名（各段 encodeURIComponent）。
 */
function normalizeBaseUrl(href) {
  const s = String(href || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/.+/i.test(s)) return s;
  try {
    const u = new URL(s);
    const parts = u.pathname.split('/').filter(Boolean);
    while (parts.length >= 2 && parts[0] === parts[1]) {
      parts.splice(1, 1);
    }
    u.pathname = '/' + parts.join('/');
    return u.toString().replace(/\/$/, '');
  } catch {
    return s;
  }
}

export function joinReleaseArtifactUrl(baseUrl, app, versionDir, fileName) {
  const b = normalizeBaseUrl(String(baseUrl || '').trim()).replace(/\/$/, '');
  return `${b}/${[String(app), String(versionDir), String(fileName)].map(encodeURIComponent).join('/')}`;
}

/**
 * 与 createWebHistory(import.meta.env.BASE_URL) 一致，便于深层路由时推断公网根（非整段 pathname）。
 */
export function suggestedPublicBaseFromVite() {
  const raw = import.meta.env.BASE_URL || '/';
  const p = String(raw).replace(/\/$/, '') || '';
  if (!p || p === '/') {
    return window.location.origin.replace(/\/$/, '');
  }
  return `${window.location.origin}${p}`.replace(/\/$/, '');
}
