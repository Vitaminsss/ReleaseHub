function fmtBytesServer(b) {
  const n = Number(b) || 0;
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function fileBadgeLabel(name) {
  if (name.endsWith('.sig')) return { label: 'SIG', cls: 'sig' };
  const f = name.toLowerCase();
  if (f.endsWith('.msi') || f.endsWith('.exe')) return { label: 'WIN', cls: 'win' };
  if (f.endsWith('.appimage.tar.gz') || f.endsWith('.appimage')) return { label: 'LINUX', cls: 'linux' };
  if (f.endsWith('.app.tar.gz') || f.endsWith('.dmg')) return { label: 'MAC', cls: 'mac' };
  return { label: 'FILE', cls: 'file' };
}

module.exports = { fmtBytesServer, fileBadgeLabel };
