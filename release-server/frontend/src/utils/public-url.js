/**
 * 将资源绝对 URL 映射到当前管理台填写的公网 publicBase（Vite BASE_URL 下的部署根）。
 * 避免对已是「公网 + 子路径」的 url 再执行 base + pathname 导致子路径（如 /releasehub）重复。
 * @param {string} absolute
 * @param {string} newBase 无尾斜线，如 https://example.com/releasehub
 * @returns {string}
 */
export function mapAssetUrlToPublicBase(absolute, newBase) {
  if (!absolute || !/^https?:\/\//i.test(absolute)) return absolute;
  const b = String(newBase || '').replace(/\/$/, '');
  if (!b) return absolute;

  let u;
  try {
    u = new URL(absolute);
  } catch {
    return absolute;
  }

  let bu;
  try {
    bu = new URL(b + '/');
  } catch {
    return absolute;
  }

  const bOrigin = bu.origin;
  const pre =
    bu.pathname.length > 1 && !bu.pathname.endsWith('/')
      ? bu.pathname + '/'
      : bu.pathname;

  if (u.origin !== bu.origin) {
    return b + u.pathname + u.search + u.hash;
  }

  let path = u.pathname;
  if (pre.length > 1) {
    const firstSeg = pre
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .pop();
    if (firstSeg) {
      const dupBlock = pre + firstSeg + '/';
      while (path.startsWith(dupBlock)) {
        path = pre + path.slice(dupBlock.length);
      }
    }
  }
  return bOrigin + path + u.search + u.hash;
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
