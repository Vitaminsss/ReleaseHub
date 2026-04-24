/**
 * 纠正误保存的 BASE_URL（路径段连续重复，如 /releasehub/releasehub）。
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

module.exports = { normalizeBaseUrl };
