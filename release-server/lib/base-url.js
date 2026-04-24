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

/**
 * 安装包/制品直链：唯一规则 BASE + /{包名}/{版本目录}/{文件名}，各段 encodeURIComponent。
 */
function joinReleaseArtifactUrl(baseUrl, app, versionDir, fileName) {
  const b = normalizeBaseUrl(String(baseUrl || '').trim()).replace(/\/$/, '');
  const a = String(app);
  const v = String(versionDir);
  const f = String(fileName);
  return `${b}/${[a, v, f].map(encodeURIComponent).join('/')}`;
}

module.exports = { normalizeBaseUrl, joinReleaseArtifactUrl };
